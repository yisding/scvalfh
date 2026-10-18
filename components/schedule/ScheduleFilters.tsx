'use client';

import { useEffect, useRef, useState } from 'react';

import EmptyState from '@/components/ui/EmptyState';
import { gameWord } from '@/lib/format/words';

import {
  DEFAULT_FILTERS,
  isDefaultFilters,
  unfilteredCountLine,
  type FilterState,
  type ScheduleCounts,
} from './filter-data';
import { railLabel, railSr, railTargets, type RailKind, type RailMarker } from './rail-targets';

/**
 * `/schedule/<league>`'s filters — the only client module this route has (DESIGN §7, §7.13);
 * tests/arch/client-boundary.test.ts enumerates every client module.
 *
 * The complete, unfiltered, server-rendered list is ALREADY in the HTML. This component does not
 * own the list, does not receive it as props and never re-renders it: it toggles the `hidden`
 * attribute on the `[data-game]` items and `[data-dategroup]` sections that the server wrote
 * (`components/schedule/filter-data.ts` is the shared contract). Consequences, all of them the
 * point:
 *
 *   - the page is complete and useful before hydration and with JavaScript disabled,
 *   - filtering costs zero network requests and zero layout of off-screen groups,
 *   - and no search params reaches a page signature, so `/schedule` stays fully static
 *     (verified in this repo: docs/01-app/03-api-reference/03-file-conventions/page.md — using
 *     search params opts a page into dynamic rendering at request time).
 *
 * Filter state lives in this component rather than in the URL. The page's own hash space is
 * already spoken for by the date anchors (`#2026-09-24`) that the timeline rail, the Scores tab and
 * every day page's "Full season" link depend on, so writing filters into the hash would break
 * navigation that works without JavaScript in order to make navigation that only works with it.
 *
 * Active filters echo back as removable chips and the live count is announced, so the state is
 * always visible — a filtered list that looks like the whole season is the failure mode here.
 *
 * League-aware (SPEC §10.4): the divisions come in as props — no division `<select>` at all for a
 * single-division league (PCAL, MCAL, EAL), and one team `<optgroup>` per division only where there
 * are several. This module is a CLIENT module, so it imports nothing that reaches the registry or
 * the league config (SPEC §0.4); the page hands it plain data.
 *
 * The timeline rail is server-rendered for the whole season, so while groups are hidden its chips
 * are re-aimed at groups that are still shown (`retargetRail`, rail-targets.ts) — a jump to a
 * `hidden` section goes nowhere — and put back exactly as served once every group shows again.
 */
export interface ScheduleFiltersProps {
  /** The league's teams, for the native `<select>`. `divisionLabel` is null in a one-table league. */
  teams: ReadonlyArray<{ slug: string; name: string; division: string; divisionLabel: string | null }>;
  /** The league's divisions; `[]` for a single-division league (no division select). */
  divisions: ReadonlyArray<{ id: string; label: string }>;
  counts: ScheduleCounts;
  /** The id of the element that holds the `[data-game]` items. */
  listId: string;
  className?: string;
}

interface Option<T extends string> {
  value: T;
  label: string;
}

const TYPE_OPTIONS: Option<FilterState['type']>[] = [
  { value: 'all', label: 'All' },
  { value: 'league', label: 'League' },
  { value: 'non-league', label: 'Non-league' },
];

const STATE_OPTIONS: Option<FilterState['state']>[] = [
  { value: 'all', label: 'All' },
  { value: 'final', label: 'Final' },
  { value: 'upcoming', label: 'To come' },
  { value: 'pending', label: 'Not reported' },
];

function matches(row: HTMLElement, f: FilterState): boolean {
  if (f.team !== 'all' && !(row.dataset.slugs ?? '').includes(` ${f.team} `)) return false;
  if (f.division !== 'all' && !(row.dataset.divisions ?? '').includes(` ${f.division} `)) {
    return false;
  }
  if (f.type === 'league' && row.dataset.league !== '1') return false;
  if (f.type === 'non-league' && row.dataset.league !== '0') return false;
  if (f.state !== 'all' && row.dataset.state !== f.state) return false;
  return true;
}

/** Hides what does not match, hides a group whose every child is hidden, returns what is left. */
function applyFilters(listId: string, f: FilterState): number {
  const root = document.getElementById(listId);
  if (!root) return 0;
  let visible = 0;
  root.querySelectorAll<HTMLElement>('[data-game]').forEach((row) => {
    const show = matches(row, f);
    row.hidden = !show;
    if (show) visible += 1;
  });
  root.querySelectorAll<HTMLElement>('[data-dategroup]').forEach((group) => {
    const shown = group.querySelectorAll('[data-game]:not([hidden])').length;
    group.hidden = shown === 0;
    const badge = group.querySelector<HTMLElement>('[data-date-count]');
    if (badge) {
      const total = Number(badge.dataset.total ?? shown);
      badge.textContent =
        shown === total ? `${total} ${gameWord(total)}` : `${shown} of ${total} ${gameWord(total)}`;
    }
  });
  retargetRail(
    root.querySelectorAll('[data-dategroup]').length,
    [...root.querySelectorAll<HTMLElement>('[data-dategroup]:not([hidden])')].map(
      (group) => group.dataset.dategroup ?? '',
    ),
  );
  return visible;
}

/** Replaces a span's text in place, keeping the text node React rendered. */
function setText(el: HTMLElement, text: string) {
  const node = el.firstChild;
  if (node && node.nodeType === Node.TEXT_NODE && !node.nextSibling) node.nodeValue = text;
  else el.textContent = text;
}

/**
 * Re-aims the timeline rail's date chips (TimelineRail.tsx) at the date groups still shown, or
 * restores them once every group is shown. The server's href, label and screen-reader text are
 * saved to `data-*-orig` the first time a chip is touched, so "restore" is exact. A chip with
 * nothing shown to jump to (no shown contest in its month, none after today) hides its `<li>`.
 */
function retargetRail(totalGroups: number, shownDates: string[]) {
  const links = document.querySelectorAll<HTMLAnchorElement>(
    "nav[aria-label='Jump to a date'] a[data-rail-date]",
  );
  const markers: RailMarker[] = [...links].map((link) => ({
    date: link.dataset.railDate ?? '',
    kind: (link.dataset.railKind ?? 'up') as RailKind,
  }));
  const allShown = shownDates.length === totalGroups;
  const targets = railTargets(shownDates, markers);
  links.forEach((link, i) => {
    const sr = link.querySelector<HTMLElement>('[data-rail-sr]');
    const label = link.querySelector<HTMLElement>('[data-rail-label]');
    const item = link.closest('li');
    if (link.dataset.hrefOrig === undefined) {
      link.dataset.hrefOrig = link.getAttribute('href') ?? '';
      if (sr) sr.dataset.srOrig = sr.textContent ?? '';
      if (label) label.dataset.labelOrig = label.textContent ?? '';
    }
    const target = targets[i];
    if (allShown || target === null) {
      link.setAttribute('href', link.dataset.hrefOrig);
      if (sr) setText(sr, sr.dataset.srOrig ?? '');
      if (label) setText(label, label.dataset.labelOrig ?? '');
      if (item) item.hidden = !allShown;
      return;
    }
    if (item) item.hidden = false;
    link.setAttribute('href', `#${target}`);
    if (sr) setText(sr, railSr(markers[i], target));
    const text = railLabel(markers[i], target);
    if (label) setText(label, text ?? label.dataset.labelOrig ?? '');
  });
}

function Chevron() {
  return (
    <svg
      className="pointer-events-none absolute right-3 text-ink-3"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

// A disabled select (the static fallback, which is all a reader without JavaScript ever sees)
// LOOKS disabled: dead controls that look live are worse than none.
const SELECT =
  'h-11 w-full appearance-none rounded-chip border border-hairline bg-surface pl-4 pr-9 text-base text-ink disabled:cursor-not-allowed disabled:text-ink-3';

function PillGroup<T extends string>({
  legend,
  value,
  options,
  onPick,
  disabled = false,
}: {
  legend: string;
  value: T;
  options: Option<T>[];
  onPick: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-2 p-0 text-micro font-medium text-ink-3">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onPick(option.value)}
              // The pressed pill is inverse ink plus an aria-hidden check, exactly like the selected
              // `.sx-league-chip` above it (DESIGN §26.1): one selected look on the page, never
              // colour alone. box-shadow is dropped in forced colours, so each pill gets a real
              // border there and the pressed one a Highlight ring as well as its check.
              // Press state, for touch as much as the mouse (`.sx-tap:active` alone loses to the
              // utility background): an unpressed pill steps one plane up from its rest fill
              // (surface → surface-2 in the in-flow tray below 1024px, surface-2 → surface-3 in the
              // floating one from there); the pressed one keeps its ink.
              className={`sx-tap inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-control px-4 text-meta disabled:cursor-not-allowed forced-colors:border forced-colors:border-[ButtonBorder] ${
                active
                  ? 'bg-ink font-semibold text-surface forced-colors:outline-2 forced-colors:outline-offset-1 forced-colors:outline-[Highlight]'
                  : 'bg-surface font-medium text-ink-2 shadow-[var(--sx-ring)] hover:bg-surface-3 active:bg-surface-2 disabled:text-ink-3 disabled:hover:bg-surface lg:bg-surface-2 lg:shadow-none lg:active:bg-surface-3 lg:disabled:hover:bg-surface-2'
              }`}
            >
              {/* Always laid out, shown only when pressed, and the label holds its semibold width
                  at either weight (`.sx-weight-hold`, globals.css): a selection never changes a
                  pill's width, so its neighbours and the wrapped rows stay put. Before the hold
                  the pressed pill was 0.6–1.4px wider than at rest ("All" 66.1 against 65.5). */}
              <span aria-hidden="true" className={active ? 'sx-check' : 'sx-check invisible'} />
              <span className="sx-weight-hold" data-label={option.label}>
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

interface PanelProps {
  teams: ScheduleFiltersProps['teams'];
  divisions: ScheduleFiltersProps['divisions'];
  filters: FilterState;
  countLine: string;
  moreActive: number;
  /** Absent in the Suspense fallback: the same shell, inert, at the same height. */
  update?: (patch: Partial<FilterState>) => void;
  /** The count line, where focus lands once the last filter chip is removed. */
  countRef?: React.Ref<HTMLParagraphElement>;
  className?: string;
}

/**
 * The panel itself: one card holding the two selects, the "More" disclosure and the live count.
 * A plain function of its props, so the Suspense fallback renders the identical shell (no CLS).
 */
function byName<T extends { name: string }>(rows: readonly T[]): T[] {
  return rows.slice().sort((a, b) => a.name.localeCompare(b.name));
}

function FiltersPanel({
  teams,
  divisions,
  filters,
  countLine,
  moreActive,
  update,
  countRef,
  className,
}: PanelProps) {
  const inert = !update;
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  // From 1024px the open tray floats over the list, so it dismisses like a popover: Escape closes
  // it (and returns focus to "More filters" when focus was in it), and so does a press anywhere
  // outside the disclosure. Below 1024px it is an in-flow part of the panel and stays a plain
  // `<details>`. Never in the inert fallback.
  useEffect(() => {
    const details = detailsRef.current;
    if (inert || !moreOpen || !details) return;
    const wide = window.matchMedia('(min-width: 1024px)');
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented || !wide.matches || !details) return;
      const hadFocus = details.contains(document.activeElement);
      details.open = false;
      if (hadFocus) summaryRef.current?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      if (!wide.matches || !details || details.contains(event.target as Node)) return;
      details.open = false;
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [inert, moreOpen]);

  return (
    // One wrapping row of items. On a 390 phone that is the two selects, then "More filters", then
    // the count on its own left-aligned row: beside the pill it needs three ragged lines at 390
    // (and four at 320), so below 400px it always takes the row under it. From 400px the count
    // sits beside the pill (right-aligned, at most two lines, as at 414). From 768px everything
    // sits on one line with the count pushed right.
    <div
      className={[
        // Screen-only: on paper the list is what is printed, not the controls that filter it.
        'sx-print-hide sx-card flex flex-wrap items-center gap-2 p-3 md:gap-3 md:p-4',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* From 768px each select has a fixed width rather than its longest option's: sized by its
          options, the team select ran 159–197px and the division select 141–177px by league, so
          "More filters" and the count sat up to 26px further along on one league's page than on
          another's. 208px and 192px hold the longest name in every league with room to spare. */}
      <label className="relative flex min-w-[8.5rem] flex-1 items-center md:w-52 md:flex-none">
        <span className="sr-only">Team</span>
        <select
          value={filters.team}
          disabled={inert}
          onChange={(event) => update?.({ team: event.target.value })}
          className={SELECT}
        >
          <option value="all">All teams</option>
          {divisions.length > 0
            ? divisions.map((division) => (
                <optgroup key={division.id} label={`${division.label} Division`}>
                  {byName(teams.filter((team) => team.division === division.id)).map((team) => (
                    <option key={team.slug} value={team.slug}>
                      {team.name}
                    </option>
                  ))}
                </optgroup>
              ))
            : byName(teams).map((team) => (
                <option key={team.slug} value={team.slug}>
                  {team.name}
                </option>
              ))}
        </select>
        <Chevron />
      </label>
      {/* No division select for a single-division league: one option would be a dead control. */}
      {divisions.length > 0 ? (
        <label className="relative flex min-w-[8.5rem] flex-1 items-center md:w-48 md:flex-none">
          <span className="sr-only">Division</span>
          <select
            value={filters.division}
            disabled={inert}
            onChange={(event) => update?.({ division: event.target.value })}
            className={SELECT}
          >
            <option value="all">{divisions.length === 2 ? 'Both divisions' : 'All divisions'}</option>
            {divisions.map((division) => (
              <option key={division.id} value={division.id}>
                {division.label}
              </option>
            ))}
          </select>
          <Chevron />
        </label>
      ) : null}
      {/* A real `<details>`. Open below 1024px, it takes the whole row so its tray is full width,
          and the count drops below it. In the inert fallback it is `sx-js-only`: without
          JavaScript that fallback is all a reader gets, and a tray of dead pills that look live is
          worse than none (with JavaScript it is painted as usual, so nothing shifts on hydrate). */}
      <details
        ref={detailsRef}
        onToggle={(event) => setMoreOpen(event.currentTarget.open)}
        className={['peer relative max-lg:open:basis-full', inert ? 'sx-js-only' : null]
          .filter(Boolean)
          .join(' ')}
      >
        <summary
          ref={summaryRef}
          className="sx-pill min-h-11 cursor-pointer list-none [&::-webkit-details-marker]:hidden"
        >
          More filters
          {moreActive > 0 ? (
            <span className="sx-badge sx-num h-6 bg-surface px-2 text-ink">
              {moreActive}
              <span className="sr-only"> active</span>
            </span>
          ) : null}
          <svg
            className="sx-chevron text-ink-3"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m4 6 4 4 4-4" />
          </svg>
        </summary>
        {/* Below 1024px: an inset tray inside the panel, in flow (a floating `w-max` card ran past
            a 768px viewport and covered the count). From 1024px: a floating card over the list. */}
        <div className="sx-card mt-2 flex flex-col gap-4 p-4 max-lg:rounded-card max-lg:bg-surface-2 max-lg:shadow-none lg:absolute lg:left-0 lg:z-20 lg:w-max lg:shadow-[var(--sx-ring),var(--sx-shadow-lift)]">
          <PillGroup
            legend="Game type"
            value={filters.type}
            options={TYPE_OPTIONS}
            onPick={(type) => update?.({ type })}
            disabled={inert}
          />
          <PillGroup
            legend="Status"
            value={filters.state}
            options={STATE_OPTIONS}
            onPick={(state) => update?.({ state })}
            disabled={inert}
          />
        </div>
      </details>
      {/* `tabIndex={-1}`: where focus goes when the last filter chip is removed (ScheduleFilters). */}
      <p
        ref={countRef}
        tabIndex={-1}
        aria-live="polite"
        className="m-0 min-w-[8rem] flex-1 px-1 text-right text-meta tabular-nums text-ink-2 max-lg:peer-open:ml-0 max-lg:peer-open:text-left max-[399px]:basis-full max-[399px]:text-left md:flex-none md:ml-auto"
      >
        {/* Each "N word" part stays on one line WITH the dot that follows it, so a phone wrap
            never strands "3" from "not reported" or opens a line on "·". The text content is
            unchanged. */}
        {countLine.split(' · ').map((part, i, parts) => (
          <span key={part}>
            {i > 0 ? ' ' : null}
            <span className="whitespace-nowrap">
              {part}
              {i < parts.length - 1 ? ' ·' : null}
            </span>
          </span>
        ))}
      </p>
    </div>
  );
}

/** The Suspense fallback for `/schedule`: the same panel, inert, so nothing shifts on hydrate. */
export function ScheduleFiltersFallback({
  teams,
  divisions,
  counts,
  className,
}: Pick<ScheduleFiltersProps, 'teams' | 'divisions' | 'counts' | 'className'>) {
  return (
    <div className={className}>
      <FiltersPanel
        teams={teams}
        divisions={divisions}
        filters={DEFAULT_FILTERS}
        countLine={unfilteredCountLine(counts)}
        moreActive={0}
      />
      {/* The prerendered page leaves this boundary pending, so WITHOUT JavaScript this fallback is
          what stays on screen: its controls are disabled, and the note saying why lives here. */}
      <noscript>
        <p className="mt-3 mb-0 text-meta text-ink-3">
          Filtering needs JavaScript. The complete season — all {counts.total}{' '}
          {gameWord(counts.total)}, oldest first — is listed below either way.
        </p>
      </noscript>
    </div>
  );
}

export function ScheduleFilters({ teams, divisions, counts, listId, className }: ScheduleFiltersProps) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [visible, setVisible] = useState<number>(counts.total);
  // A removed chip's button unmounts under the keyboard, which would drop focus to <body>. The
  // click records which chip went (-1 for "Clear all"); the effect below moves focus once the
  // chips have re-rendered, and only after such a click — never on mount or another filter change.
  const chipsRef = useRef<HTMLParagraphElement>(null);
  const countRef = useRef<HTMLParagraphElement>(null);
  const removedChip = useRef<number | null>(null);

  function update(patch: Partial<FilterState>) {
    const next: FilterState = { ...filters, ...patch };
    setFilters(next);
    setVisible(applyFilters(listId, next));
  }

  const filtered = !isDefaultFilters(filters);
  const teamName = teams.find((t) => t.slug === filters.team)?.name;

  const chips: { key: string; label: string; clear: Partial<FilterState> }[] = [];
  if (filters.team !== 'all' && teamName) {
    chips.push({ key: 'team', label: teamName, clear: { team: 'all' } });
  }
  const divisionLabel = divisions.find((d) => d.id === filters.division)?.label;
  if (filters.division !== 'all' && divisionLabel) {
    chips.push({ key: 'division', label: divisionLabel, clear: { division: 'all' } });
  }
  if (filters.type !== 'all') {
    chips.push({
      key: 'type',
      label: filters.type === 'league' ? 'League only' : 'Non-league only',
      clear: { type: 'all' },
    });
  }
  if (filters.state !== 'all') {
    chips.push({
      key: 'state',
      label: STATE_OPTIONS.find((o) => o.value === filters.state)?.label ?? filters.state,
      clear: { state: 'all' },
    });
  }

  // What the "More" disclosure holds, counted, so its state is visible while it is closed.
  const moreActive =
    (filters.type !== 'all' ? 1 : 0) + (filters.state !== 'all' ? 1 : 0);

  const countLine = filtered
    ? `${visible} of ${counts.total} ${gameWord(counts.total)} shown`
    : unfilteredCountLine(counts);

  // The chip now at the removed one's place (the new last one if it was last); with none left, or
  // after "Clear all", the count line, which announces the result anyway.
  useEffect(() => {
    const index = removedChip.current;
    if (index === null) return;
    removedChip.current = null;
    const buttons = chipsRef.current?.querySelectorAll<HTMLButtonElement>('button[data-chip]') ?? [];
    if (index >= 0 && buttons.length > 0) buttons[Math.min(index, buttons.length - 1)].focus();
    else countRef.current?.focus();
  }, [chips.length]);

  return (
    <div className={className}>
      {/* ONE card of controls. Team and division stay in the row, exactly as DESIGN §3.3 draws
          them; game type and status sit behind one disclosure. Whatever is active echoes back as
          removable pills below, so a filtered list can never look like the whole season. The
          panel is not sticky at any width: the date header is the sticky thing on this page. */}
      <FiltersPanel
        teams={teams}
        divisions={divisions}
        filters={filters}
        countLine={countLine}
        moreActive={moreActive}
        update={update}
        countRef={countRef}
      />

      <noscript>
        <p className="mt-3 mb-0 text-meta text-ink-3">
          Filtering needs JavaScript. The complete season — all {counts.total}{' '}
          {gameWord(counts.total)}, oldest first — is listed below either way.
        </p>
      </noscript>

      {chips.length > 0 ? (
        <p ref={chipsRef} className="mt-3 mb-0 flex flex-wrap items-center gap-2">
          {chips.map((chip, index) => (
            <button
              key={chip.key}
              type="button"
              data-chip
              onClick={() => {
                removedChip.current = index;
                update(chip.clear);
              }}
              className="sx-pill min-h-11"
            >
              {chip.label}
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                aria-hidden="true"
                className="text-ink-3"
              >
                <path d="m3 3 6 6M9 3 3 9" />
              </svg>
              <span className="sr-only">— remove this filter</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              removedChip.current = -1;
              update(DEFAULT_FILTERS);
            }}
            className="inline-flex min-h-11 items-center rounded-chip px-3 text-meta font-medium text-accent hover:bg-surface-2"
          >
            Clear all
          </button>
        </p>
      ) : null}

      {filtered && visible === 0 ? (
        <EmptyState heading="No games match these filters." className="mt-4">
          Remove one of the filters above — they are all still listed, and still removable — or
          clear them all to see the whole season again.
        </EmptyState>
      ) : null}
    </div>
  );
}

export default ScheduleFilters;
