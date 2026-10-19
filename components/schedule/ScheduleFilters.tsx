'use client';

import { useEffect, useRef, useState } from 'react';

import { applyFilters } from '@/components/hooks/schedule-filter-dom';
import EmptyState from '@/components/ui/EmptyState';
import { gameWord } from '@/lib/format/words';
import {
  DEFAULT_FILTERS,
  isDefaultFilters,
  unfilteredCountLine,
  type FilterState,
  type ScheduleCounts,
} from '@/views/schedule/filters-client';

import {
  FiltersPanel,
  STATE_OPTIONS,
  type FilterDivisions,
  type FilterTeams,
} from './FiltersPanel';

/**
 * `/schedule/<league>`'s filters — the state half (DESIGN §7, §7.13): filter state, the removable
 * chips and the count line. The panel markup is FiltersPanel.tsx (also rendered inert by the page as
 * the Suspense fallback), the DOM work is components/hooks/schedule-filter-dom.ts and the match rule
 * is `matchesFilter`; tests/arch/client-boundary.test.ts enumerates every client module.
 *
 * The complete, unfiltered, server-rendered list is ALREADY in the HTML. This component does not
 * own the list, does not receive it as props and never re-renders it: it toggles the `hidden`
 * attribute on the `[data-game]` items and `[data-dategroup]` sections that the server wrote
 * (`views/schedule/filters-client.ts` is the shared contract). Consequences, all of them the
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
 * are re-aimed at groups that are still shown (`retargetRail`, components/hooks/schedule-filter-dom.ts) — a jump to a
 * `hidden` section goes nowhere — and put back exactly as served once every group shows again.
 */
export interface ScheduleFiltersProps {
  /** The league's teams, for the native `<select>`. `divisionLabel` is null in a one-table league. */
  teams: FilterTeams;
  /** The league's divisions; `[]` for a single-division league (no division select). */
  divisions: FilterDivisions;
  counts: ScheduleCounts;
  /** The id of the element that holds the `[data-game]` items. */
  listId: string;
  className?: string;
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
