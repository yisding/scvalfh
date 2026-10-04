'use client';

import Link from 'next/link';
import { Fragment, useEffect, useId, useMemo, useState } from 'react';

import { plural } from '../ui/plural';
import { usePinnedTeam } from '../ui/use-pinned-team';
import { pinLabel } from '../../lib/pin-label';
import {
  normalizeQuery,
  searchTeams,
  type GroupSearchEntry,
  type NotCoveredEntry,
  type SearchIndex,
  type TeamSearchEntry,
} from '../../lib/search';

/**
 * Find a team (SPEC §9.3): a pure, zero-network matcher (lib/search.ts) over the pre-serialized
 * 49-team index the page passes in. Two modes:
 *
 * - `filter` (/teams): the page's own server-rendered, grouped list IS the result list. This
 *   toggles `hidden` on its `[data-team-tile="<slug>"]` items (the standings tables' team rows, so
 *   no empty row is left for a screen reader) and on any `[data-team-group]` wrapper left with no
 *   visible team — the `ScheduleFilters` pattern; the component does not own the list — hides
 *   every `[data-hide-while-searching]` inside the list (a table's labelled ladder row, which means
 *   nothing between filtered rows) while a query is active, and hides `#hideWhileSearchingId` (the
 *   anchor switcher) while a query is typed. Empty query restores all.
 * - `pin` (home): renders its own results — up to `limit` teams in relevance order, then
 *   `Search all 49 on Teams →` when more match. Each result is a `<button>` with NO aria-label:
 *   the visible short name and `<division heading> · <league short>` line sit inside a name that
 *   reads exactly like the pin tiles' (`pinLabel`, lib/pin-label.ts: `Pin Leigh, Mt. Hamilton ·
 *   BVAL`), the extra words being sr-only, so the accessible name contains the visible text in
 *   order (WCAG 2.5.3). A tap pins the team (which remembers its league) and calls `onPin`; the
 *   caller moves focus. When this browser stores nothing (`localStorage` throws), each result is
 *   instead a plain link to the team page (`TeamResultLink`) under one line saying why, and Enter
 *   on a single match follows it — a pin that cannot be stored is never offered.
 *
 * Both modes show "Divisions and leagues" results (links) above the teams, and the not-covered
 * sentences ("York plays JV field hockey only…").
 *
 * No combobox, no roving focus: results are ordinary buttons and links in DOM order. Enter with
 * exactly one team result activates it; Escape clears; there is NO single-key shortcut (WCAG
 * 2.1.4). A polite live region, debounced 250 ms, says how many things match. No network, no URL
 * writes. Every id comes from `useId()` — the home page renders two finders. The whole finder is a
 * `<search>` landmark with `sx-js-only`, so it is hidden without JS (the full list, or the plain
 * league links, are the page then) and painted with its height from the first frame with JS
 * (`html[data-js]` is stamped before paint). While a query is typed the `<search>` element
 * carries `data-searching`, so a caller can drop a fixed slot height with an arbitrary variant
 * (e.g. `has-[[data-searching]]:h-auto`).
 */
export interface TeamFinderProps {
  index: SearchIndex;
  mode: 'filter' | 'pin';
  /** filter mode: id of the server-rendered list container whose [data-team-tile] items and [data-team-group] wrappers are toggled. */
  listId?: string;
  /** filter mode: id of an element hidden while the query is non-empty (the /teams anchor switcher). */
  hideWhileSearchingId?: string;
  /** Default 'School, city or mascot'. */
  label?: string;
  /** pin mode default 8. */
  limit?: number;
  /** pin mode: called after a result is pinned (the caller manages focus: MyTeamCard → its handlePin; FindYourTeam → focus #my-team-unpin). */
  onPin?: (slug: string, leagueId: string) => void;
  className?: string;
}

export const DEFAULT_FINDER_LABEL = 'School, city or mascot';
export const PIN_LIMIT = 8;
const DEBOUNCE_MS = 250;

function joinAnd(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The same "a query at all" rule as `searchTeams`: ≥ 2 characters raw and compact. */
export function isActiveQuery(query: string): boolean {
  const raw = query.trim();
  return raw.length >= 2 && normalizeQuery(raw).compact.length >= 2;
}

/** 'Mt. Hamilton · BVAL' | 'MCAL' (single-division leagues show no division). */
export function pinResultDetail(entry: TeamSearchEntry): string {
  return entry.divisionLabel ? `${entry.divisionLabel} · ${entry.leagueShort}` : entry.leagueShort;
}

/** The league short names in index order: 'SCVAL, BVAL, PCAL, MCAL and EAL'. */
function leagueList(index: SearchIndex): string {
  return joinAnd([...new Set(index.teams.map((t) => t.leagueShort))]);
}

export interface FinderView {
  /** Every matching team, relevance order (filter mode shows them all). */
  matches: TeamSearchEntry[];
  /** The teams this finder lists itself (pin mode: the first `limit`; filter mode: none). */
  shown: TeamSearchEntry[];
  /** pin mode: more teams match than are shown → the "Search all 49 on Teams →" link. */
  more: boolean;
  groups: GroupSearchEntry[];
  notCovered: NotCoveredEntry[];
  /** The live-region sentence ('' for an inactive query). */
  message: string;
}

/** Everything the finder renders for `query`, as data (unit-tested in tests/ui/team-finder.test.ts). */
export function finderView(
  index: SearchIndex,
  query: string,
  mode: TeamFinderProps['mode'],
  limit: number = PIN_LIMIT,
): FinderView {
  if (!isActiveQuery(query)) {
    return { matches: [], shown: [], more: false, groups: [], notCovered: [], message: '' };
  }
  const result = searchTeams(index, query);
  const matches = result.teams.map((t) => t.entry);
  const shown = mode === 'pin' ? matches.slice(0, Math.max(0, limit)) : [];
  const q = query.trim();

  const parts: string[] = [];
  if (matches.length) parts.push(plural(matches.length, 'team', 'teams'));
  const divisions = result.groups.filter((g) => g.kind === 'division').length;
  const leagues = result.groups.filter((g) => g.kind === 'league').length;
  if (divisions) parts.push(plural(divisions, 'division', 'divisions'));
  if (leagues) parts.push(plural(leagues, 'league', 'leagues'));
  let message: string;
  if (parts.length > 0) {
    const one = matches.length + divisions + leagues === 1;
    message = `${joinAnd(parts)} ${one ? 'matches' : 'match'} "${q}".`;
  } else if (result.notCovered.length > 0) {
    message = result.notCovered.map((n) => n.reason).join(' ');
  } else {
    message = `No team matches "${q}". Search covers the ${index.teams.length} teams in ${leagueList(index)}.`;
  }

  return {
    matches,
    shown,
    more: mode === 'pin' && matches.length > shown.length,
    groups: result.groups,
    notCovered: result.notCovered,
    message,
  };
}

/**
 * Split `pinLabel(entry)` around the visible short name: `[before, visible, after]`, so the button
 * can show `visible` and keep the rest sr-only. A short name inside the full name
 * (`Pin Archbishop Mitty, <detail>`) → ['Pin Archbishop ', 'Mitty', ', ']; one that is not
 * (`Pin St Francis (Saint Francis), <detail>`) → ['Pin ', 'St Francis', ' (Saint Francis), '].
 * The detail line is the visible second line.
 */
export function pinResultParts(entry: TeamSearchEntry): { before: string; visible: string; after: string; detail: string } {
  const detail = pinResultDetail(entry);
  const label = pinLabel({
    name: entry.name,
    shortName: entry.shortName,
    divisionHeading: entry.divisionLabel,
    leagueShort: entry.leagueShort,
  });
  const tail = `, ${detail}`;
  const at = label.toLowerCase().indexOf(entry.shortName.toLowerCase(), 'Pin '.length);
  if (!label.startsWith('Pin ') || !label.endsWith(tail) || at < 0 || at + entry.shortName.length > label.length - tail.length) {
    // pinLabel's format changed: fall back to the plain form.
    return { before: 'Pin ', visible: entry.shortName, after: ', ', detail };
  }
  return {
    before: label.slice(0, at),
    visible: label.slice(at, at + entry.shortName.length),
    after: label.slice(at + entry.shortName.length, label.length - detail.length),
    detail,
  };
}

/** One pin-mode result: a button whose name is the pin label and whose text is what you see. */
export function PinResult({ entry, onPick }: { entry: TeamSearchEntry; onPick: (entry: TeamSearchEntry) => void }) {
  const { before, visible, after, detail } = pinResultParts(entry);
  return (
    <button
      type="button"
      onClick={() => onPick(entry)}
      className="sx-tap flex min-h-11 w-full flex-col items-start justify-center rounded-card px-3 py-2 text-left"
    >
      <span className="text-body font-semibold text-ink">
        <span className="sr-only">{before}</span>
        {visible}
        <span className="sr-only">{after}</span>
      </span>
      <span className="text-meta text-ink-2">{detail}</span>
    </button>
  );
}

/**
 * One pin-mode result when this browser stores nothing (`localStorage` throws): pinning cannot
 * work, so the result is a plain link to the team page with the same visible text — never a pin
 * button that would leave an empty My-team box with no Unpin to recover from.
 */
export function TeamResultLink({ entry }: { entry: TeamSearchEntry }) {
  return (
    <Link
      href={`/teams/${entry.slug}`}
      prefetch={false}
      className="flex min-h-11 w-full flex-col items-start justify-center rounded-card px-3 py-2 text-left no-underline"
    >
      <span className="text-body font-semibold text-accent">{entry.shortName}</span>
      <span className="text-meta text-ink-2">{pinResultDetail(entry)}</span>
    </Link>
  );
}

/** The line above the results when pinning cannot work in this browser. */
export const PIN_UNAVAILABLE_NOTE = 'This browser is not storing a pinned team, so a result opens its team page.';

function GroupResults({ groups, kickerId }: { groups: readonly GroupSearchEntry[]; kickerId: string }) {
  if (groups.length === 0) return null;
  return (
    <div className="mt-3">
      <p id={kickerId} className="m-0 text-micro font-semibold text-ink-3">
        Divisions and leagues
      </p>
      <ul aria-labelledby={kickerId} className="m-0 mt-1 list-none p-0">
        {groups.map((group) => (
          <li key={`${group.kind}:${group.id}`}>
            <Link
              href={group.href}
              prefetch={false}
              className="flex min-h-11 flex-col justify-center rounded-card px-3 py-1 no-underline"
            >
              <span className="text-body font-semibold text-accent">{group.label}</span>
              <span className="text-meta text-ink-2">{group.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TeamFinder({
  index,
  mode,
  listId,
  hideWhileSearchingId,
  label = DEFAULT_FINDER_LABEL,
  limit = PIN_LIMIT,
  onPin,
  className,
}: TeamFinderProps) {
  const inputId = useId();
  const liveId = useId();
  const resultsId = useId();
  const groupsKickerId = useId();
  const [query, setQuery] = useState('');
  const [announced, setAnnounced] = useState('');
  const { ready, available, pin } = usePinnedTeam();
  // pin mode with storage blocked: results are team-page links, not pin buttons.
  const linkResults = mode === 'pin' && ready && !available;

  const view = useMemo(() => finderView(index, query, mode, limit), [index, query, mode, limit]);
  const typing = query.trim() !== '';

  // The polite live region, debounced so a screen reader is not interrupted per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setAnnounced(view.message), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [view.message]);

  // filter mode: toggle the server-rendered tiles and their group wrappers in place. A DOM write
  // to elements this component does not own is exactly what an effect is for; no state is set.
  useEffect(() => {
    if (mode !== 'filter') return;
    const list = listId ? document.getElementById(listId) : null;
    const hideMe = hideWhileSearchingId ? document.getElementById(hideWhileSearchingId) : null;
    if (hideMe) hideMe.hidden = typing;
    if (!list) return;
    const keep = isActiveQuery(query) ? new Set(view.matches.map((t) => t.slug)) : null;
    for (const tile of list.querySelectorAll<HTMLElement>('[data-team-tile]')) {
      tile.hidden = keep !== null && !keep.has(tile.getAttribute('data-team-tile') ?? '');
    }
    for (const el of list.querySelectorAll<HTMLElement>('[data-hide-while-searching]')) {
      el.hidden = keep !== null;
    }
    // Innermost wrappers first (reverse document order), so a section that only holds hidden
    // leagues is hidden too.
    for (const group of [...list.querySelectorAll<HTMLElement>('[data-team-group]')].reverse()) {
      group.hidden = keep !== null && group.querySelector('[data-team-tile]:not([hidden])') === null;
    }
  }, [mode, listId, hideWhileSearchingId, query, typing, view.matches]);

  // Restore everything if the finder goes away mid-search.
  useEffect(() => {
    if (mode !== 'filter') return;
    return () => {
      const list = listId ? document.getElementById(listId) : null;
      list
        ?.querySelectorAll<HTMLElement>('[data-team-tile], [data-team-group], [data-hide-while-searching]')
        .forEach((el) => {
          el.hidden = false;
        });
      const hideMe = hideWhileSearchingId ? document.getElementById(hideWhileSearchingId) : null;
      if (hideMe) hideMe.hidden = false;
    };
  }, [mode, listId, hideWhileSearchingId]);

  const pick = (entry: TeamSearchEntry) => {
    // A failed write (storage blocked) changes nothing, so there is no pinned card to focus.
    if (!pin(entry.slug, entry.leagueId)) return;
    setQuery('');
    onPin?.(entry.slug, entry.leagueId);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && query !== '') {
      event.preventDefault();
      setQuery('');
      return;
    }
    if (event.key !== 'Enter' || view.matches.length !== 1) return;
    event.preventDefault();
    const only = view.matches[0];
    if (mode === 'pin') {
      if (linkResults) document.getElementById(resultsId)?.querySelector<HTMLElement>('a[href]')?.click();
      else pick(only);
    } else if (listId) {
      document
        .getElementById(listId)
        ?.querySelector<HTMLElement>(`[data-team-tile="${only.slug}"] a[href]`)
        ?.click();
    }
  };

  const active = isActiveQuery(query);
  const nothing = active && view.matches.length === 0 && view.groups.length === 0;

  return (
    <search
      className={`sx-js-only block${className ? ` ${className}` : ''}`}
      data-searching={typing ? '' : undefined}
    >
      <label htmlFor={inputId} className="mb-1 block text-meta font-medium text-ink">
        {label}
      </label>
      <input
        id={inputId}
        type="search"
        enterKeyHint="go"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
        className="block h-12 w-full rounded-card border border-rule bg-surface px-3 text-body text-ink"
      />
      <p id={liveId} role="status" aria-live="polite" className="sr-only">
        {announced}
      </p>

      {active ? (
        <div>
          <GroupResults groups={view.groups} kickerId={groupsKickerId} />
          {view.notCovered.map((n) => (
            <p key={n.name} className="mt-3 mb-0 text-meta text-ink-2">
              {n.reason}
            </p>
          ))}
          {nothing && view.notCovered.length === 0 ? (
            <p className="mt-3 mb-0 text-meta text-ink-2">{view.message}</p>
          ) : null}
          {mode === 'pin' && view.shown.length > 0 ? (
            <Fragment>
              {linkResults ? <p className="mt-3 mb-0 text-meta text-ink-2">{PIN_UNAVAILABLE_NOTE}</p> : null}
              <ul id={resultsId} className="m-0 mt-2 list-none p-0">
                {view.shown.map((entry) => (
                  <li key={entry.slug}>
                    {linkResults ? <TeamResultLink entry={entry} /> : <PinResult entry={entry} onPick={pick} />}
                  </li>
                ))}
              </ul>
              {view.more ? (
                <Link href="/teams" prefetch={false} className="sx-action mt-1 inline-flex min-h-11 items-center text-accent">
                  Search all {index.teams.length} on Teams →
                </Link>
              ) : null}
            </Fragment>
          ) : null}
        </div>
      ) : null}
    </search>
  );
}

export default TeamFinder;
