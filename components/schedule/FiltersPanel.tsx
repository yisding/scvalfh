'use client';

import { useEffect, useRef, useState } from 'react';

import { Chevron, PillGroup, SELECT, type PillOption } from '@/components/ui/PillGroup';
import { gameWord } from '@/lib/format/words';
import {
  DEFAULT_FILTERS,
  unfilteredCountLine,
  type FilterState,
  type ScheduleCounts,
} from '@/views/schedule/filters-client';

/**
 * `/schedule/<league>`'s filters panel and its inert Suspense fallback: the markup half of the
 * filters (DESIGN §7.13). A client module because the panel owns the "More filters" popover's
 * effects, and because the page renders `ScheduleFiltersFallback` from the server. State, chips and
 * the count live in ScheduleFilters.tsx; the DOM work is components/hooks/schedule-filter-dom.ts.
 */

/** The league's teams, for the native `<select>`. `divisionLabel` is null in a one-table league. */
export type FilterTeams = ReadonlyArray<{ slug: string; name: string; division: string; divisionLabel: string | null }>;
/** The league's divisions; `[]` for a single-division league (no division select). */
export type FilterDivisions = ReadonlyArray<{ id: string; label: string }>;

const TYPE_OPTIONS: PillOption<FilterState['type']>[] = [
  { value: 'all', label: 'All' },
  { value: 'league', label: 'League' },
  { value: 'non-league', label: 'Non-league' },
];

export const STATE_OPTIONS: PillOption<FilterState['state']>[] = [
  { value: 'all', label: 'All' },
  { value: 'final', label: 'Final' },
  { value: 'upcoming', label: 'To come' },
  { value: 'pending', label: 'Not reported' },
];

export interface FiltersPanelProps {
  teams: FilterTeams;
  divisions: FilterDivisions;
  filters: FilterState;
  countLine: string;
  moreActive: number;
  /** Absent in the Suspense fallback: the same shell, inert, at the same height. */
  update?: (patch: Partial<FilterState>) => void;
  /** The count line, where focus lands once the last filter chip is removed. */
  countRef?: React.Ref<HTMLParagraphElement>;
  className?: string;
}

// Not views/leaders/ranking's `byName`: that one compares two strings and the leaders views are
// server-only; this one sorts rows by their `name` and ships to the browser.
function byName<T extends { name: string }>(rows: readonly T[]): T[] {
  return rows.slice().sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The panel itself: one card holding the two selects, the "More" disclosure and the live count.
 * A plain function of its props, so the Suspense fallback renders the identical shell (no CLS).
 */
export function FiltersPanel({
  teams,
  divisions,
  filters,
  countLine,
  moreActive,
  update,
  countRef,
  className,
}: FiltersPanelProps) {
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
}: {
  teams: FilterTeams;
  divisions: FilterDivisions;
  counts: ScheduleCounts;
  className?: string;
}) {
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
