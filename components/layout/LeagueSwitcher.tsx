'use client';

import Link from 'next/link';
import { useState } from 'react';

import { setLeague, useEffectiveLeague } from '../ui/use-league';
import type { SectionConfig } from '../../lib/leagues';
import type { LeagueId } from '../../lib/types';

/**
 * The league chips (SPEC §8.3). One component, three modes:
 *
 * - `scope` (home): `<div role="group">` of `<button aria-pressed>` chips — `All SCVAL BVAL PCAL
 *   MCAL EAL` — and the ONLY chips that write the remembered league (`setLeague`). The selected
 *   chip is drawn by the scope stylesheet from `html[data-league]` before hydration
 *   (`[data-league-option]`, components/layout/league-scope-css.ts) and is announced through
 *   `aria-pressed` after. Hidden without JS (`sx-js-only`), and `disabled` until hydrated: a tap
 *   before hydration would do nothing. A polite live region says what a tap did.
 * - `link` (`/standings/[league]`, `/schedule/[league]`): `<nav>` of plain links, the page's league
 *   marked `aria-current="page"`, a leading `All` chip to the index page (`hrefs.all`). Following
 *   one NEVER writes the league; it works with JS off.
 * - `anchor` (`/standings`, `/teams`, `/playoffs`): `<nav>` of `#id` links. Never writes.
 *
 * Chip token: `text-micro` weight 600, `min-h-11 min-w-11 px-2`, 6px gap, `flex-wrap` (200% text
 * zoom wraps rather than clipping). No visible section captions: the league chips sit in one list
 * per section, labelled `Central Coast Section` / `North Coast Section` / `Northern Section`, split
 * by hairlines; the `All` chip precedes them all. The current chip is the accent wash, accent ink,
 * a 1.5px ink ring AND an aria-hidden ✓ (`.sx-chip-check`) — never colour alone. No league hue
 * anywhere.
 */
export interface LeagueChip {
  id: LeagueId;
  shortName: string;
  sectionShort: SectionConfig['shortName'];
}

export interface LeagueSwitcherProps {
  mode: 'scope' | 'link' | 'anchor';
  /** Config order. */
  leagues: readonly LeagueChip[];
  /** link mode: the page's league (aria-current="page"); absent on an index page. */
  current?: LeagueId;
  /** link: { all: '/standings', bval: '/standings/bval', … }; anchor: { bval: '#bval', … }. */
  hrefs?: Readonly<Record<string, string>>;
  /** The accessible name, e.g. 'Your league', 'Leagues'. */
  label: string;
  /** scope and link modes: a leading "All" chip. */
  includeAll?: boolean;
  className?: string;
}

/**
 * Spelled out rather than read from SECTIONS: this is a client component, and the league config
 * stays out of client bundles. The `Record` type makes a new section a compile error here.
 */
const SECTION_NAMES: Readonly<Record<SectionConfig['shortName'], string>> = {
  CCS: 'Central Coast Section',
  NCS: 'North Coast Section',
  NS: 'Northern Section',
};

/** The `All` chip's option value (matches the stored `'all'`). */
const ALL = 'all';

const CHIP = 'sx-league-chip';

/** Leagues grouped by section, in order of first appearance (config order). */
function bySection(leagues: readonly LeagueChip[]): Array<{ section: LeagueChip['sectionShort']; leagues: LeagueChip[] }> {
  const groups: Array<{ section: LeagueChip['sectionShort']; leagues: LeagueChip[] }> = [];
  for (const league of leagues) {
    const group = groups.find((g) => g.section === league.sectionShort);
    if (group) group.leagues.push(league);
    else groups.push({ section: league.sectionShort, leagues: [league] });
  }
  return groups;
}

function Check() {
  return (
    <span aria-hidden="true" className="sx-chip-check">
      ✓
    </span>
  );
}

/** A section list's classes. */
const SECTION_LIST = 'm-0 flex list-none flex-wrap items-center gap-1.5 p-0';

/**
 * The hairline that splits one section from the next, drawn by the list it introduces (a `::before`,
 * so it is never in the accessibility tree). A separate flex item in the outer row could be left at
 * the end of a line when the next section wraps (All + five chips at 320-360px, or 200% text zoom);
 * as the list's own first box it always travels with that list and leads its line.
 */
const SECTION_DIVIDER = 'before:h-6 before:w-px before:shrink-0 before:self-center before:bg-hairline';

/** The two (or more) section lists, split by hairlines. `chip` renders one league's control. */
function SectionLists({
  leagues,
  chip,
}: {
  leagues: readonly LeagueChip[];
  chip: (league: LeagueChip) => React.ReactNode;
}) {
  return bySection(leagues).map((group, i) => (
    <ul
      key={group.section}
      aria-label={SECTION_NAMES[group.section]}
      className={i > 0 ? `${SECTION_LIST} ${SECTION_DIVIDER}` : SECTION_LIST}
    >
      {group.leagues.map((league) => (
        <li key={league.id} className="flex">
          {chip(league)}
        </li>
      ))}
    </ul>
  ));
}

function ScopeSwitcher({ leagues, label, includeAll, className }: LeagueSwitcherProps) {
  const { league, ready } = useEffectiveLeague();
  const [said, setSaid] = useState('');

  const choose = (id: LeagueId | typeof ALL) => {
    setLeague(id);
    const chip = leagues.find((l) => l.id === id);
    setSaid(chip ? `Showing ${chip.shortName}.` : 'Showing the latest from every league.');
  };

  const button = (id: string, text: string) => {
    const selected = id === ALL ? league === null : league === id;
    return (
      <button
        type="button"
        data-league-option={id}
        aria-pressed={ready ? selected : false}
        disabled={!ready}
        onClick={() => choose(id)}
        className={CHIP}
      >
        <Check />
        {text}
      </button>
    );
  };

  return (
    <div
      role="group"
      aria-label={label}
      className={`sx-js-only flex flex-wrap items-center gap-1.5${className ? ` ${className}` : ''}`}
    >
      {includeAll ? button(ALL, 'All') : null}
      <SectionLists leagues={leagues} chip={(l) => button(l.id, l.shortName)} />
      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}

function LinkSwitcher({ mode, leagues, current, hrefs = {}, label, includeAll, className }: LeagueSwitcherProps) {
  const chip = (id: string, text: string) => {
    const href = hrefs[id];
    if (!href) return null;
    const isCurrent = mode === 'link' && (id === ALL ? current === undefined : current === id);
    const body = (
      <>
        {isCurrent ? <Check /> : null}
        {text}
      </>
    );
    // Anchor chips stay on the page: a plain fragment link. Link chips are routes: no prefetch,
    // because a chip row is a per-league list (tests/ui/prefetch-policy.test.ts).
    return mode === 'anchor' ? (
      <a href={href} className={CHIP}>
        {body}
      </a>
    ) : (
      <Link href={href} prefetch={false} aria-current={isCurrent ? 'page' : undefined} className={CHIP}>
        {body}
      </Link>
    );
  };

  return (
    <nav aria-label={label} className={`flex flex-wrap items-center gap-1.5${className ? ` ${className}` : ''}`}>
      {includeAll && mode === 'link' ? chip(ALL, 'All') : null}
      <SectionLists leagues={leagues} chip={(l) => chip(l.id, l.shortName)} />
    </nav>
  );
}

export function LeagueSwitcher(props: LeagueSwitcherProps) {
  return props.mode === 'scope' ? <ScopeSwitcher {...props} /> : <LinkSwitcher {...props} />;
}

export default LeagueSwitcher;
