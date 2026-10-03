'use client';

import { useState } from 'react';

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
import { railLabel, railSr, railTargets, type RailKind, type RailMarker } from './rail-targets';

/**
 * `/schedule/<league>`'s filters — the only client module this route has (DESIGN §7, §7.13); see
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
 * single-division league (PCAL, MCAL), and one team `<optgroup>` per division only where there
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
  'h-11 w-full appearance-none rounded-full border border-hairline bg-surface pl-4 pr-9 text-base text-ink disabled:cursor-not-allowed disabled:text-ink-3';

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
              // box-shadow is dropped in forced colours, so each pill gets a real border there and
              // the pressed one a Highlight ring: the state is never reduced to font weight.
              // Press state, for touch as much as the mouse (`.sx-tap:active` alone loses to the
              // utility background): an unpressed pill steps one plane up from its rest fill
              // (surface → surface-2 on a phone, surface-2 → surface-3 from 768px); the pressed
              // one keeps its wash and thickens its accent ring to 2px.
              className={`sx-tap inline-flex h-11 min-w-11 items-center justify-center rounded-full px-4 text-meta disabled:cursor-not-allowed forced-colors:border forced-colors:border-[ButtonBorder] ${
                active
                  ? 'bg-accent-wash font-semibold text-accent-ink shadow-[inset_0_0_0_1px_var(--sx-accent)] active:shadow-[inset_0_0_0_2px_var(--sx-accent)] forced-colors:outline-2 forced-colors:outline-offset-1 forced-colors:outline-[Highlight]'
                  : 'bg-surface font-medium text-ink-2 shadow-[var(--sx-ring)] hover:bg-surface-3 active:bg-surface-2 disabled:text-ink-3 disabled:hover:bg-surface md:bg-surface-2 md:shadow-none md:active:bg-surface-3 md:disabled:hover:bg-surface-2'
              }`}
            >
              {option.label}
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
  className?: string;
}

/**
 * The panel itself: one card holding the two selects, the "More" disclosure and the live count.
 * A plain function of its props, so the Suspense fallback renders the identical shell (no CLS).
 */
function byName<T extends { name: string }>(rows: readonly T[]): T[] {
  return rows.slice().sort((a, b) => a.name.localeCompare(b.name));
}

function FiltersPanel({ teams, divisions, filters, countLine, moreActive, update, className }: PanelProps) {
  const inert = !update;
  return (
    // One wrapping row of items. On a 390 phone that is the two selects, then "More filters" with
    // the count beside it (right-aligned, at most two lines) — a ~120px closed panel instead of
    // four stacked rows. Below 390 the space beside the pill is too narrow (124px at 320 wrapped
    // the count into four ragged lines), so the count takes its own left-aligned row under it.
    // From 768px everything sits on one line with the count pushed right.
    <div
      className={[
        'sx-card flex flex-wrap items-center gap-2 p-3 md:gap-3 md:p-4',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <label className="relative flex min-w-[8.5rem] flex-1 items-center md:flex-none">
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
        <label className="relative flex min-w-[8.5rem] flex-1 items-center md:flex-none">
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
      {/* A real `<details>`, so the panel opens with JavaScript off too. Open on a phone, it
          takes the whole row so its tray is full width, and the count drops below it. */}
      <details className="peer relative max-md:open:basis-full">
        <summary className="sx-pill min-h-11 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
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
        {/* Phone: an inset tray inside the panel. From 768px: a floating card over the list. */}
        <div className="sx-card mt-2 flex flex-col gap-4 p-4 max-md:rounded-card max-md:bg-surface-2 max-md:shadow-none md:absolute md:left-0 md:z-20 md:w-max md:shadow-[var(--sx-ring),var(--sx-shadow-lift)]">
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
      <p
        aria-live="polite"
        className="m-0 min-w-0 flex-1 px-1 text-right text-meta tabular-nums text-ink-2 max-md:peer-open:text-left max-[389px]:basis-full max-[389px]:text-left md:flex-none md:ml-auto"
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
          {contestWord(counts.total)}, oldest first — is listed below either way.
        </p>
      </noscript>
    </div>
  );
}

export function ScheduleFilters({ teams, divisions, counts, listId, className }: ScheduleFiltersProps) {
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
    ? `${visible} of ${counts.total} ${contestWord(counts.total)} shown`
    : unfilteredCountLine(counts);

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
      />

      <noscript>
        <p className="mt-3 mb-0 text-meta text-ink-3">
          Filtering needs JavaScript. The complete season — all {counts.total}{' '}
          {contestWord(counts.total)}, oldest first — is listed below either way.
        </p>
      </noscript>

      {chips.length > 0 ? (
        <p className="mt-3 mb-0 flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => update(chip.clear)}
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
            onClick={() => update(DEFAULT_FILTERS)}
            className="inline-flex min-h-11 items-center rounded-full px-3 text-meta font-medium text-accent hover:bg-surface-2"
          >
            Clear all
          </button>
        </p>
      ) : null}

      {filtered && visible === 0 ? (
        <EmptyState heading="No contests match these filters." className="mt-4">
          Remove one of the filters above — they are all still listed, and still removable — or
          clear them all to see the whole season again.
        </EmptyState>
      ) : null}
    </div>
  );
}

export default ScheduleFilters;
