/**
 * The nav's destinations (`NAV_DESTINATIONS`, TopNav and the 404 page) and per-league targets
 * (`navLeagueHrefs`, TopNav and BottomTabBar). A server-side module: it reads
 * lib/config/leagues, which tests/arch/client-boundary.test.ts keeps out of client modules, so it cannot
 * live in the client NavLink.tsx beside the nav logic that consumes its output.
 */
import {
  CCS_LEAGUE_IDS, LEAGUE_IDS, LEAGUES_PROPER, NO_POSTSEASON_LEAGUE_IDS, SECTION_PLAYOFFS_LEAGUE_IDS,
  TOURNAMENT_LEAGUE_IDS, UNBRACKETED_LEAGUE_IDS, getLeague,
} from '@/lib/config/leagues';
import { getAvailableHistoryLeagues } from '@/lib/datasets/history';
import { listWords, numberWord } from '@/lib/format/words';
import type { LeagueId } from '@/lib/model/ids';

/**
 * 'the nine leagues', from the config (never a literal count). It named every league ('SCVAL, BVAL, PCAL,
 * MCAL and EAL') while there were five; with nine across two regions the list outgrew a one-line card
 * description, so the count stands in for it (the Teams page itself lists them, region by region). It counts
 * the leagues with a table: the LA independents have none (DESIGN §24.9), so "every table in
 * the nine leagues" stays exact.
 */
const LEAGUE_COUNT = `the ${numberWord(LEAGUES_PROPER.length)} leagues`;

/** One top-level page of the site, as the desktop nav and the 404 page's cards both name it. */
export interface NavDestination {
  href: string;
  /** The nav link's visible label. */
  label: string;
  /** Read by a screen reader after the label (History: what its page holds). */
  srSuffix?: string;
  /** The 404 card's name over its description (longer than the nav label for Schedule and Teams). */
  cardName: string;
  /** The 404 card's one-line description. */
  description: string;
}

/**
 * The seven top-level destinations, in nav order (DESIGN §1.3, §16, §18): the desktop nav
 * (components/layout/TopNav.tsx) and the 404 page's cards (app/not-found.tsx) render this one list.
 * It matches the phone bar: Teams is the teams-and-standings page (the standings live there, and
 * Teams stays lit on every /standings page), so there is no separate Standings entry. History keeps
 * its short visible label; an sr-only suffix says what it holds (its page is titled with the same words).
 */
export const NAV_DESTINATIONS: readonly NavDestination[] = [
  { href: '/', label: 'Home', cardName: 'Home', description: 'What just happened, and when the next game is' },
  { href: '/schedule', label: 'Schedule', cardName: 'Schedule & results', description: 'Every league’s season' },
  {
    href: '/teams',
    label: 'Teams',
    cardName: 'Teams and standings',
    description: `Find your school; every table in ${LEAGUE_COUNT}`,
  },
  {
    href: '/leaders',
    label: 'Leaders',
    cardName: 'Season leaders',
    description: 'Top scorers, keepers and records, every league',
  },
  { href: '/playoffs', label: 'Playoffs', cardName: 'Playoffs', description: 'Who is in, and the key dates' },
  {
    href: '/history/2025-26',
    label: 'History',
    srSuffix: ' (2025-26 final standings)',
    cardName: 'History',
    description: `Last season’s final ${listWords(getAvailableHistoryLeagues().map((l) => getLeague(l.id).shortName))} tables and awards`,
  },
  { href: '/about', label: 'About', cardName: 'About', description: 'Where this data comes from' },
];

/**
 * The league-aware targets of the three nav entries that have a per-league place (SPEC §8.3),
 * built once from the league config and handed to the client `NavLink` as plain, serializable
 * objects. Scores → `/schedule/<id>`; Teams → the league's section of the teams-and-standings page
 * (`/teams#<id>`, which took over the old Table tab's job of opening your league's tables, DESIGN
 * §18); Playoffs → the league's section of the CCS page (`/playoffs#<id>`) for a CCS-ladder league,
 * its own tournament page (`/playoffs/<id>`) for a league-tournament league, and its pointer card on
 * the CCS page (`/playoffs#<id>`) for an unbracketed league (the EAL: no bracket, no page of its
 * own). The SoCal leagues have no page of their own either (DESIGN-socal §2.4): a San Diego league
 * ('section-playoffs': City, North County, Metro) and the Sunset ('no-postseason': the Southern
 * Section holds no playoffs) each go to their card in the SoCal block of /playoffs (`/playoffs#<id>`),
 * which the page renders and scripts/ci/assert-copy.ts checks. Every other entry keeps its one href.
 */
export function navLeagueHrefs(): Readonly<Record<string, Readonly<Record<LeagueId, string>>>> {
  const per = (f: (id: LeagueId) => string | null) =>
    Object.fromEntries(
      LEAGUE_IDS.flatMap((id) => {
        const href = f(id);
        return href === null ? [] : [[id, href] as const];
      }),
    );
  return {
    '/schedule': per((id) => `/schedule/${id}`),
    '/teams': per((id) => `/teams#${id}`),
    '/playoffs': per((id) =>
      TOURNAMENT_LEAGUE_IDS.includes(id)
        ? `/playoffs/${id}`
        : CCS_LEAGUE_IDS.includes(id) ||
            UNBRACKETED_LEAGUE_IDS.includes(id) ||
            SECTION_PLAYOFFS_LEAGUE_IDS.includes(id) ||
            NO_POSTSEASON_LEAGUE_IDS.includes(id)
          ? `/playoffs#${id}`
          : null,
    ),
  };
}
