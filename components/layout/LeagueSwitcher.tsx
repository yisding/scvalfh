'use client';

import Link from 'next/link';
import { useState } from 'react';

import { setLeague, setRegion, useEffectiveLeague, useEffectiveRegion } from '../ui/use-league';
import type { SectionConfig } from '../../lib/leagues';
import type { LeagueId, RegionId } from '../../lib/types';

import { ALL_LEAGUES } from './prefs-script';

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
 * - `anchor` (`/standings`, `/teams`, `/playoffs`): `<nav>` of `#id` links to the page's own
 *   sections, which may include route links (on /playoffs a tournament league's chip goes to
 *   `/playoffs/<league>`). Never writes.
 *
 * Chip token: `text-micro` weight 600, `min-h-11 min-w-11 px-2`, 6px gap, `flex-wrap` (200% text
 * zoom wraps rather than clipping). No visible section captions: the league chips sit in one list
 * per section, labelled `Central Coast Section` / `North Coast Section` / `Northern Section` /
 * `Southern Section` / `San Diego Section`, split by hairlines; the `All` chip precedes them all.
 * The current chip is the accent wash, accent ink, a 1.5px ink ring AND an aria-hidden ✓
 * (`.sx-chip-check`) — never colour alone. No league hue anywhere.
 *
 * Regions (DESIGN-socal §2.4). In `scope` and `anchor` mode each section list carries
 * `data-region-scope="<its region>"`, so the scope stylesheet shows only the effective region's
 * lists once JS has run (both, NorCal first, without it). The attribute sits on the lists themselves,
 * never on a wrapper: a wrapper would make a region one flex item and stop the per-list wrapping
 * DESIGN §22.3 relies on. The hairline is drawn from a list's index WITHIN ITS REGION, so the first
 * SoCal list never opens the row with a divider when NorCal's lists are hidden. `link` mode is handed
 * one region's chips (components/layout/league-chips.ts, the page league's region) and stamps no
 * scope: its lists must show whichever region the reader last chose.
 *
 * `RegionSwitcher` (below) is the NorCal/SoCal control. It lives in this module and keeps its state
 * in components/ui/use-league.ts on purpose: every page that renders it already ships both, so the
 * toggle adds no client module to first-load JS (design-review UI budgets §2).
 */
export interface LeagueChip {
  id: LeagueId;
  shortName: string;
  sectionShort: SectionConfig['shortName'];
  /** The league's region (its section's): the `data-region-scope` of the list it sits in. */
  region: RegionId;
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
  SS: 'Southern Section',
  SDS: 'San Diego Section',
};

/**
 * The two regions' words, spelled out for the same reason (lib/leagues.ts REGIONS: `shortName` on the
 * buttons, `name` in the live-region sentence). `Record<RegionId, …>` makes a new region a compile
 * error here. NorCal first: the default view and the JS-free reading order.
 */
const REGION_WORDS: Readonly<Record<RegionId, { shortName: string; name: string }>> = {
  norcal: { shortName: 'NorCal', name: 'Northern California' },
  socal: { shortName: 'SoCal', name: 'Southern California' },
};
const REGION_ORDER: readonly RegionId[] = ['norcal', 'socal'];

const CHIP = 'sx-league-chip';

interface SectionGroup {
  section: LeagueChip['sectionShort'];
  region: RegionId;
  leagues: LeagueChip[];
}

/** Leagues grouped by section, in order of first appearance (config order). */
function bySection(leagues: readonly LeagueChip[]): SectionGroup[] {
  const groups: SectionGroup[] = [];
  for (const league of leagues) {
    const group = groups.find((g) => g.section === league.sectionShort);
    if (group) group.leagues.push(league);
    else groups.push({ section: league.sectionShort, region: league.region, leagues: [league] });
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

/**
 * The section lists, split by hairlines. `chip` renders one league's control. With `regionScoped`
 * each list carries `data-region-scope`; either way a list draws the divider only when it is not
 * the first list of its region, since the scope stylesheet may hide the other region's lists.
 */
function SectionLists({
  leagues,
  chip,
  regionScoped,
}: {
  leagues: readonly LeagueChip[];
  chip: (league: LeagueChip) => React.ReactNode;
  regionScoped: boolean;
}) {
  const seen = new Map<RegionId, number>();
  return bySection(leagues).map((group) => {
    const indexInRegion = seen.get(group.region) ?? 0;
    seen.set(group.region, indexInRegion + 1);
    return (
      <ul
        key={group.section}
        aria-label={SECTION_NAMES[group.section]}
        data-region-scope={regionScoped ? group.region : undefined}
        className={indexInRegion > 0 ? `${SECTION_LIST} ${SECTION_DIVIDER}` : SECTION_LIST}
      >
        {group.leagues.map((league) => (
          <li key={league.id} className="flex">
            {chip(league)}
          </li>
        ))}
      </ul>
    );
  });
}

function ScopeSwitcher({ leagues, label, includeAll, className }: LeagueSwitcherProps) {
  const { league, ready } = useEffectiveLeague();
  const { region } = useEffectiveRegion();
  const [said, setSaid] = useState('');

  const choose = (id: LeagueId | typeof ALL_LEAGUES) => {
    setLeague(id);
    const chip = leagues.find((l) => l.id === id);
    // 'All' shows every league OF THE REGION ON SCREEN (the other region's lists are hidden), so the
    // sentence names it: "Showing every Southern California league." (DESIGN-socal §2.4).
    setSaid(chip ? `Showing ${chip.shortName}.` : `Showing every ${REGION_WORDS[region].name} league.`);
  };

  const button = (id: string, text: string) => {
    const selected = id === ALL_LEAGUES ? league === null : league === id;
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
      className={['sx-js-only flex flex-wrap items-center gap-1.5', className].filter(Boolean).join(' ')}
    >
      {includeAll ? button(ALL_LEAGUES, 'All') : null}
      <SectionLists leagues={leagues} regionScoped chip={(l) => button(l.id, l.shortName)} />
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
    const isCurrent = mode === 'link' && (id === ALL_LEAGUES ? current === undefined : current === id);
    const body = (
      <>
        {isCurrent ? <Check /> : null}
        {text}
      </>
    );
    // A `#id` chip stays on the page: a plain fragment link. Any other href is a route, in either
    // mode (/playoffs' tournament leagues are route chips in an anchor row): a `<Link>` with no
    // prefetch, because a chip row is a per-league list (tests/ui/prefetch-policy.test.ts).
    return href.startsWith('#') ? (
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
    <nav aria-label={label} className={['flex flex-wrap items-center gap-1.5', className].filter(Boolean).join(' ')}>
      {includeAll && mode === 'link' ? chip(ALL_LEAGUES, 'All') : null}
      <SectionLists leagues={leagues} regionScoped={mode === 'anchor'} chip={(l) => chip(l.id, l.shortName)} />
    </nav>
  );
}

export interface RegionSwitcherProps {
  className?: string;
  /** The group's accessible name. Default 'Region'. */
  label?: string;
  /**
   * Draw a trailing hairline (the control's own `::after`, so it travels with it when the row wraps):
   * the home scope row, where the region control leads and the league chips follow (DESIGN-socal §2.4:
   * "separated from the league chips by a hairline"). Off where the control is a row of its own.
   */
  separated?: boolean;
}

/**
 * The NorCal/SoCal control (DESIGN-socal §2.4): `<div role="group" aria-label="Region">` of two
 * `<button aria-pressed data-region-option>`, styled as a SEGMENTED control — the two segments share
 * one rounded `surface-2` track — rather than as two more league chips, so 'NorCal ✓' never reads
 * as a peer of 'All ✓'. Each segment is the chip token (44px target, `min-h-11 min-w-11`) and the
 * selected one is the same accent wash, accent ink, 1.5px ink ring and aria-hidden ✓ as a chip: never
 * colour alone, no new colour. Before hydration the scope stylesheet draws the selected segment from
 * `html[data-region]` (`[data-region-option]`, components/layout/league-scope-css.ts); after, aria-pressed
 * does. Hidden without JS (`sx-js-only`: both regions are on the page then, NorCal first) and
 * `disabled` until hydrated. A polite live region says what a tap did ("Showing Southern California.").
 * `setRegion` writes `scvalfh.region` and, when the effective league is in the other region, removes the
 * remembered league (never writes 'All'), so a pinned team's league returns with its region
 * (components/ui/use-league.ts). Not in the SiteHeader: a page renders it under its header.
 */
export function RegionSwitcher({ className, label = 'Region', separated = false }: RegionSwitcherProps) {
  const { region, ready } = useEffectiveRegion();
  const [said, setSaid] = useState('');

  const choose = (id: RegionId) => {
    setRegion(id);
    setSaid(`Showing ${REGION_WORDS[id].name}.`);
  };

  return (
    <div
      role="group"
      aria-label={label}
      className={[
        'sx-js-only flex shrink-0 items-center gap-1.5',
        separated ? 'after:h-6 after:w-px after:shrink-0 after:self-center after:bg-hairline' : null,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="inline-flex items-center gap-0.5 rounded-[12px] bg-surface-2 p-0.5">
        {REGION_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            data-region-option={id}
            aria-pressed={ready ? region === id : false}
            disabled={!ready}
            onClick={() => choose(id)}
            className={`${CHIP} min-h-11 min-w-11`}
          >
            <Check />
            {REGION_WORDS[id].shortName}
          </button>
        ))}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}

export function LeagueSwitcher(props: LeagueSwitcherProps) {
  return props.mode === 'scope' ? <ScopeSwitcher {...props} /> : <LinkSwitcher {...props} />;
}

export default LeagueSwitcher;
