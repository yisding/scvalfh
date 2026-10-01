'use client';

import { useState } from 'react';

import { DIVISION_LABELS } from '../../lib/season';
import type { Division } from '../../lib/types';
import EmptyState from '../ui/EmptyState';

import {
  DEFAULT_FILTERS,
  contestWord,
  gameWord,
  isDefaultFilters,
  unfilteredCountLine,
  type FilterState,
  type ScheduleCounts,
} from './filter-data';

/**
 * `/schedule`'s filters — the only client module this route has (DESIGN §7, §7.13); see
 * components/ui/PinControl.tsx for the app's full client-module list.
 *
 * The complete, unfiltered, server-rendered list is ALREADY in the HTML. This component does not
 * own the list, does not receive it as props and never re-renders it: it toggles the `hidden`
 * attribute on the `[data-game]` items and `[data-dategroup]` sections that the server wrote
 * (`components/schedule/filter-data.ts` is the shared contract). Consequences, all of them the
 * point:
 *
 *   - the page is complete and useful before hydration and with JavaScript disabled,
 *   - filtering costs zero network requests and zero layout of off-screen groups,
 *   - and no `searchParams` reaches a page signature, so `/schedule` stays fully static
 *     (verified in this repo: docs/01-app/03-api-reference/03-file-conventions/page.md — using
 *     `searchParams` opts a page into dynamic rendering at request time).
 *
 * Filter state lives in this component rather than in the URL. The page's own hash space is
 * already spoken for by the date anchors (`#2026-09-24`) that the timeline rail and every
 * `share →` link depend on, so writing filters into the hash would break navigation that works
 * without JavaScript in order to make navigation that only works with it.
 *
 * Active filters echo back as removable chips and the live count is announced, so the state is
 * always visible — a filtered list that looks like the whole season is the failure mode here.
 */
export interface ScheduleFiltersProps {
  /** The 16 SCVAL teams, for the native `<select>`. */
  teams: readonly { slug: string; name: string; division: Division }[];
  counts: ScheduleCounts;
  /** The id of the element that holds the `[data-game]` items. */
  listId: string;
  className?: string;
}

interface Option<T extends string> {
  value: T;
  label: string;
}

const DIVISION_OPTIONS: Option<FilterState['division']>[] = [
  { value: 'all', label: 'Both' },
  { value: 'de-anza', label: DIVISION_LABELS['de-anza'] },
  { value: 'el-camino', label: DIVISION_LABELS['el-camino'] },
];

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
  return visible;
}

function PillGroup<T extends string>({
  legend,
  value,
  options,
  onPick,
}: {
  legend: string;
  value: T;
  options: Option<T>[];
  onPick: (value: T) => void;
}) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-wrap items-center gap-2 border-0 p-0">
      <legend className="shrink-0 pr-1 font-mono text-kicker font-semibold tracking-[0.10em] uppercase text-ink-3">
        {legend}
      </legend>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onPick(option.value)}
            className={`sx-tap inline-flex h-11 min-w-11 items-center justify-center rounded-chip border px-2.5 text-meta ${
              active
                ? 'border-rule bg-surface-3 font-semibold text-ink'
                : 'border-hairline bg-surface text-ink-2'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}

export function ScheduleFilters({ teams, counts, listId, className }: ScheduleFiltersProps) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [visible, setVisible] = useState<number>(counts.total);

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
  if (filters.division !== 'all') {
    chips.push({
      key: 'division',
      label: DIVISION_LABELS[filters.division],
      clear: { division: 'all' },
    });
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
    ? `${visible} of ${counts.total} ${contestWord(counts.total)} shown`
    : unfilteredCountLine(counts);

  return (
    <div className={className}>
      {/* ONE row of controls, which is what DESIGN §3.3 budgets (44 top bar · 48 filter row · 24
          count · 36 rail · 34 date header = 186, leaving six GameRows above the fold). Three
          pill GROUPS laid out flat wrapped to three rows on a 390px phone and pushed the first
          result to y=427 — one result above the fold on the longest page on the site. Team and
          division stay in the row, exactly as §3.3 draws them, and the other two dimensions sit
          behind one disclosure that opens over the list. Whatever is active still echoes back as
          removable mono chips below, so a filtered list can never look like the whole season.

          Sticky from 768px up only: pinning even this row to the top of a phone would spend
          fold on chrome that the date header needs more (DESIGN §1.3). */}
      <div className="-mx-gutter border-b border-hairline bg-bg px-gutter py-2 md:sticky md:top-topbar-lg md:z-10 md:-mx-gutter-lg md:px-gutter-lg">
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5">
            <span className="sr-only">Team</span>
            <select
              value={filters.team}
              onChange={(event) => update({ team: event.target.value })}
              className="h-11 max-w-[11rem] rounded-chip border border-hairline bg-surface px-2 text-meta text-ink"
            >
              <option value="all">All teams</option>
              {DIVISION_OPTIONS.slice(1).map((division) => (
                <optgroup key={division.value} label={`${division.label} Division`}>
                  {teams
                    .filter((team) => team.division === division.value)
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((team) => (
                      <option key={team.slug} value={team.slug}>
                        {team.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="inline-flex items-center gap-1.5">
            <span className="sr-only">Division</span>
            <select
              value={filters.division}
              onChange={(event) =>
                update({ division: event.target.value as FilterState['division'] })
              }
              className="h-11 rounded-chip border border-hairline bg-surface px-2 text-meta text-ink"
            >
              <option value="all">Both divisions</option>
              {DIVISION_OPTIONS.slice(1).map((division) => (
                <option key={division.value} value={division.value}>
                  {division.label}
                </option>
              ))}
            </select>
          </label>
          {/* A real `<details>`, so the panel opens with JavaScript off too. */}
          <details className="relative">
            <summary className="sx-tap inline-flex h-11 cursor-pointer list-none items-center gap-1.5 rounded-chip border border-hairline bg-surface px-2.5 text-meta text-ink-2 [&::-webkit-details-marker]:hidden">
              More
              {moreActive > 0 ? (
                <span className="sx-num inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-3 px-1 text-kicker font-semibold text-ink">
                  {moreActive}
                  <span className="sr-only"> filters active</span>
                </span>
              ) : null}
              <span aria-hidden="true">&#8964;</span>
            </summary>
            <div className="mt-2 space-y-2 rounded-card border border-hairline bg-surface p-3 md:absolute md:z-20 md:mt-1 md:w-max md:shadow-[var(--sx-shadow-raised)]">
              <PillGroup
                legend="Game type"
                value={filters.type}
                options={TYPE_OPTIONS}
                onPick={(type) => update({ type })}
              />
              <PillGroup
                legend="Status"
                value={filters.state}
                options={STATE_OPTIONS}
                onPick={(state) => update({ state })}
              />
            </div>
          </details>
        </div>
        <p aria-live="polite" className="sx-num m-0 mt-1.5 text-meta text-ink-2">
          {countLine}
        </p>
      </div>

      <noscript>
        <p className="mt-2 mb-0 text-meta text-ink-3">
          Filtering needs JavaScript. The complete season — all {counts.total}{' '}
          {contestWord(counts.total)}, oldest first — is listed below either way.
        </p>
      </noscript>

      {chips.length > 0 ? (
        <p className="mt-2 mb-0 flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => update(chip.clear)}
              className="sx-tap inline-flex h-11 items-center gap-1.5 rounded-chip border border-hairline bg-surface-3 px-2.5 font-mono text-kicker font-semibold tracking-[0.10em] uppercase text-ink"
            >
              {chip.label}
              <span aria-hidden="true">&#10005;</span>
              <span className="sr-only">— remove this filter</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => update(DEFAULT_FILTERS)}
            className="inline-flex h-11 items-center px-2 text-meta text-accent hover:underline"
          >
            Clear all
          </button>
        </p>
      ) : null}

      {filtered && visible === 0 ? (
        <EmptyState heading="No contests match these filters.">
          Remove one of the filters above — they are all still listed, and still removable — or
          clear them all to see the whole season again.
        </EmptyState>
      ) : null}
    </div>
  );
}

export default ScheduleFilters;
