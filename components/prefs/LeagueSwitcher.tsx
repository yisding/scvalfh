'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { setLeague, setRegion, useEffectiveLeague, useEffectiveRegion } from './use-league';
import type { SectionConfig } from '../../lib/league-config/shape';
import type { LeagueId, RegionId } from '../../lib/types';

import type { LeagueChip } from '../layout/league-chips';
import { ALL_LEAGUES } from './prefs-script';
import { SINGLE_REGION } from './single-region';

/**
 * The league chips (SPEC §8.3). One component, three modes:
 *
 * - `scope` (home): `<div role="group">` of `<button aria-pressed>` chips — `All SCVAL BVAL PCAL
 *   MCAL EAL` — and the ONLY chips that write the remembered league (`setLeague`). The selected
 *   chip is drawn by the scope stylesheet from `html[data-league]` before hydration
 *   (`[data-league-option]`, components/prefs/league-scope-css.ts) and is announced through
 *   `aria-pressed` after. Hidden without JS (`sx-js-only`), and `disabled` until hydrated: a tap
 *   before hydration would do nothing. A polite live region says what a tap did.
 * - `link` (`/standings/[league]`, `/schedule/[league]`): `<nav>` of plain links, the page's league
 *   marked `aria-current="page"`, a leading `All` chip to the index page (`hrefs.all`). Following
 *   one NEVER writes the league; it works with JS off.
 * - `anchor` (`/standings`, `/teams`, `/playoffs`): `<nav>` of `#id` links to the page's own
 *   sections, which may include route links (on /playoffs a tournament league's chip goes to
 *   `/playoffs/<league>`). Never writes.
 *
 * Face (DESIGN §33): every chip is a `.sx-tab` — text on the row's hairline, the selected one ink at
 * weight 700 with a 3px ink bar (never colour alone). `sx-league-chip` stays the FIRST class: it is the
 * hook the scope stylesheet and the tests use. A label is set twice (`.sx-weight-hold`), so the bold
 * selected state never moves a neighbour. The row never wraps: it scrolls sideways inside its own box
 * with no scrollbar, and on mount the selected chip is brought into view. Alone, a switcher is its own
 * `.sx-tabs` row; inside a `ScopeBar` (`.sx-scope`) the bar owns the hairline and the scrolling. The
 * league chips sit in one list per section, labelled `Central Coast Section` / … for a screen reader;
 * nothing is drawn between sections. No league hue anywhere. `link` and `anchor` rows are screen-only
 * (`sx-print-hide`); the `scope` row is `sx-js-only`, which print hides too.
 *
 * Regions (DESIGN-socal §2.4). In `scope` and `anchor` mode each section list carries
 * `data-region-scope="<its region>"`, so the scope stylesheet shows only the effective region's
 * lists once JS has run (both, NorCal first, without it). The attribute sits on the lists themselves,
 * never on a wrapper. `link` mode is handed
 * one region's chips (components/layout/league-chips.ts, the page league's region) and stamps no
 * scope: its lists must show whichever region the reader last chose.
 *
 * `RegionSwitcher` (below) is the NorCal/SoCal control. It lives in this module and keeps its state
 * in components/prefs/use-league.ts on purpose: every page that renders it already ships both, so the
 * toggle adds no client module to first-load JS (design-review UI budgets §2).
 */
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
 * The two regions' words, spelled out for the same reason (lib/league-config/sections.ts REGIONS: `shortName` on the
 * buttons, `name` in the live-region sentence). `Record<RegionId, …>` makes a new region a compile
 * error here. NorCal first: the default view and the JS-free reading order.
 */
const REGION_WORDS: Readonly<Record<RegionId, { shortName: string; name: string }>> = {
  norcal: { shortName: 'NorCal', name: 'Northern California' },
  socal: { shortName: 'SoCal', name: 'Southern California' },
};
const REGION_ORDER: readonly RegionId[] = ['norcal', 'socal'];
const CHIP = 'sx-league-chip sx-tab';

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

/** A chip's words, set twice so the 700 selected state is no wider than the 500 resting one. */
function Label({ text }: { text: string }) {
  return (
    <span className="sx-weight-hold" data-label={text}>
      {text}
    </span>
  );
}

/**
 * Brings the selected chip into view inside its scrolling row (the `ScopeBar` when there is one, else
 * the switcher itself) whenever `key` changes. It moves the row's own `scrollLeft` and nothing else:
 * `scrollIntoView` would also scroll the PAGE to a row that sits below the fold.
 */
function useSelectedInView(key: string) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const root = ref.current;
    const selected = root?.querySelector<HTMLElement>('[aria-pressed="true"],[aria-current="page"]');
    if (!root || !selected) return;
    const row = root.closest<HTMLElement>('.sx-scope') ?? root;
    const box = row.getBoundingClientRect();
    const item = selected.getBoundingClientRect();
    if (item.left < box.left) row.scrollLeft -= box.left - item.left;
    else if (item.right > box.right) row.scrollLeft += item.right - box.right;
  }, [key]);
  return ref;
}

/**
 * The section lists. `chip` renders one league's control. With `regionScoped` each list carries
 * `data-region-scope`, so the scope stylesheet may hide the other region's lists.
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
  return bySection(leagues).map((group) => (
    <ul key={group.section} aria-label={SECTION_NAMES[group.section]} data-region-scope={regionScoped ? group.region : undefined}>
      {group.leagues.map((league) => (
        <li key={league.id}>{chip(league)}</li>
      ))}
    </ul>
  ));
}

function ScopeSwitcher({ leagues, label, includeAll, className }: LeagueSwitcherProps) {
  const { league, ready } = useEffectiveLeague();
  const { region } = useEffectiveRegion();
  const [said, setSaid] = useState('');
  const ref = useSelectedInView(ready ? `${region} ${league ?? ALL_LEAGUES}` : '');

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
        <Label text={text} />
      </button>
    );
  };

  return (
    <div
      ref={(node) => {
        ref.current = node;
      }}
      role="group"
      aria-label={label}
      className={['sx-js-only sx-tabs', className].filter(Boolean).join(' ')}
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
  const ref = useSelectedInView(mode === 'link' ? (current ?? ALL_LEAGUES) : '');
  const chip = (id: string, text: string) => {
    const href = hrefs[id];
    if (!href) return null;
    const isCurrent = mode === 'link' && (id === ALL_LEAGUES ? current === undefined : current === id);
    const body = <Label text={text} />;
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
    <nav
      ref={(node) => {
        ref.current = node;
      }}
      aria-label={label}
      className={['sx-print-hide sx-tabs', className].filter(Boolean).join(' ')}
    >
      {includeAll && mode === 'link' ? chip(ALL_LEAGUES, 'All') : null}
      <SectionLists leagues={leagues} regionScoped={mode === 'anchor'} chip={(l) => chip(l.id, l.shortName)} />
    </nav>
  );
}

export interface RegionSwitcherProps {
  className?: string;
  /** The group's accessible name. Default 'Region'. */
  label?: string;
  /** @deprecated No longer draws anything: `ScopeBar` places the divider between the two controls. */
  separated?: boolean;
}

/**
 * The NorCal/SoCal control (DESIGN-socal §2.4): `<div role="group" aria-label="Region">` of two
 * `<button aria-pressed data-region-option>`, drawn as two `.sx-tab`s like every other selector. Before
 * hydration the scope stylesheet draws the selected one from `html[data-region]` (`[data-region-option]`,
 * components/prefs/league-scope-css.ts); after, aria-pressed does. Hidden without JS (`sx-js-only`: both
 * regions are on the page then, NorCal first) and `disabled` until hydrated. A polite live region says
 * what a tap did ("Showing Southern California."). `setRegion` writes `scvalfh.region` and, when the
 * effective league is in the other region, removes the remembered league (never writes 'All'), so a
 * pinned team's league returns with its region (components/prefs/use-league.ts). Not in the SiteHeader:
 * a page renders it under its header, normally through `ScopeBar`.
 */
export function RegionSwitcher({ className, label = 'Region' }: RegionSwitcherProps) {
  const { region, ready } = useEffectiveRegion();
  const [said, setSaid] = useState('');

  const choose = (id: RegionId) => {
    setRegion(id);
    setSaid(`Showing ${REGION_WORDS[id].name}.`);
  };
  if (SINGLE_REGION) return null;

  return (
    <div role="group" aria-label={label} className={['sx-js-only sx-tabs', className].filter(Boolean).join(' ')}>
      {REGION_ORDER.map((id) => (
        <button
          key={id}
          type="button"
          data-region-option={id}
          aria-pressed={ready ? region === id : false}
          disabled={!ready}
          onClick={() => choose(id)}
          className={CHIP}
        >
          <Label text={REGION_WORDS[id].shortName} />
        </button>
      ))}
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
