import { plural } from '../../lib/format';
import type { FestivalClub } from '../../lib/festival/festival';
import {
  byDayAndSlot,
  clubHref,
  divisionHref,
  festivalModel,
  finalsOf,
  gameRow,
  latestAndNext,
  teamCard,
  type DayModel,
  type FestivalModel,
  type GameRowModel,
  type SlotModel,
  type TeamCardModel,
} from './festival-model';
import { clockET, dayKeyET, dayLabelET, stampWords } from './festival-time';
import { siteClubInfo, type SiteClubLookup } from './site-clubs';

/**
 * /festival, the hub (DESIGN §35 §6): where the event stands, the reader's followed teams, the California teams,
 * the latest results and the next slot, then a way into every division and club. Everything from the file's
 * statuses; nothing from the clock.
 */

export interface DivisionRowModel {
  slug: string;
  href: string;
  /** 'U19'. */
  short: string;
  /** 'U-19 Girls 11v11'. */
  name: string;
  format: string;
  teams: number;
  pools: number;
  finals: number;
  games: number;
  /** '6 pools · 32 teams · 24 of 80 games final'. */
  facts: string;
  hasBracket: boolean;
}

export interface ClubLinkModel {
  slug: string;
  href: string;
  name: string;
  teams: number;
}

export interface CaliforniaClubModel {
  slug: string;
  name: string;
  href: string;
  /** 'San Francisco'. */
  region: string | null;
  /** This site's club page, when the club has one. */
  site: { name: string; href: string } | null;
  teams: TeamCardModel[];
}

export interface CaliforniaGroupModel {
  id: 'norcal' | 'socal';
  heading: 'Northern California' | 'Southern California';
  clubs: CaliforniaClubModel[];
}

export interface HubViewModel {
  name: string;
  /** 'Naples, Fla.'. */
  place: string;
  venue: string;
  /** 'Nov 26–28'. */
  dates: string;
  /** 'Day 2 of 3 · 143 of 295 games final' / 'Final results' / 'Starts Thu Nov 26, 8:00 AM ET'. */
  status: string;
  complete: boolean;
  /** 'Thu 3:42 PM ET · 12:42 PM PT'. */
  stamp: string;
  fetchedAt: string;
  resultsUrl: string;
  infoUrl: string;
  /** Every team, for the hidden "Your teams" cards. */
  cards: TeamCardModel[];
  california: CaliforniaGroupModel[];
  latest: SlotModel<GameRowModel> | null;
  next: SlotModel<GameRowModel> | null;
  divisions: DivisionRowModel[];
  clubs: ClubLinkModel[];
  teams: number;
  games: number;
  finals: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'Nov 26–28' from two date keys in one month; 'Nov 30–Dec 2' across two. */
export function eventDates(start: string, end: string): string {
  const [, sm, sd] = start.split('-').map(Number);
  const [, em, ed] = end.split('-').map(Number);
  if (start === end) return `${MONTHS[sm - 1]} ${sd}`;
  return sm === em ? `${MONTHS[sm - 1]} ${sd}–${ed}` : `${MONTHS[sm - 1]} ${sd}–${MONTHS[em - 1]} ${ed}`;
}

/** 'Fla.' for the feed's 'FL': the site's AP state style. Only the venue's state is ever needed. */
const AP_STATE: Record<string, string> = { FL: 'Fla.', CA: 'Calif.' };

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** The status line, from the data. */
export function statusLine(m: FestivalModel): { text: string; complete: boolean } {
  const { games, tournament } = m.file;
  const finals = finalsOf(games);
  if (games.length > 0 && finals === games.length) return { text: 'Final results', complete: true };
  const started = games.filter((g) => g.status !== 'scheduled');
  if (started.length === 0) {
    const first = games[0];
    return { text: first ? `Starts ${dayLabelET(first.startUtc)}, ${clockET(first.startUtc)} ET` : 'Schedule not posted yet', complete: false };
  }
  const days = daysBetween(tournament.startDate, tournament.endDate) + 1;
  const day = Math.min(days, Math.max(1, daysBetween(tournament.startDate, dayKeyET(started.at(-1)!.startUtc)) + 1));
  return { text: `Day ${day} of ${days} · ${finals} of ${plural(games.length, 'game')} final`, complete: false };
}

export function divisionRows(m: FestivalModel): DivisionRowModel[] {
  return m.file.divisions.map((d) => {
    const games = m.file.games.filter((g) => g.divisionKey === d.key);
    const teams = m.file.teams.filter((t) => t.divisionKey === d.key).length;
    const finals = finalsOf(games);
    return {
      slug: d.slug,
      href: divisionHref(d.slug),
      short: d.short,
      name: d.name,
      format: d.format,
      teams,
      pools: d.pools.length,
      finals,
      games: games.length,
      facts: [plural(teams, 'team'), plural(d.pools.length, 'pool'), `${finals} of ${plural(games.length, 'game')} final`].join(' · '),
      hasBracket: games.some((g) => g.kind === 'placement'),
    };
  });
}

/** The California clubs' teams, Northern then Southern: by this site's club region where it has the club, else the curated flag. */
export function californiaGroups(m: FestivalModel, site: SiteClubLookup = siteClubInfo): CaliforniaGroupModel[] {
  const groups: CaliforniaGroupModel[] = [
    { id: 'norcal', heading: 'Northern California', clubs: [] },
    { id: 'socal', heading: 'Southern California', clubs: [] },
  ];
  for (const club of m.clubs.filter((c) => c.california)) {
    const info = club.siteClub ? site(club.siteClub) : null;
    const half = info?.siteRegion ?? (club.norCal ? 'norcal' : 'socal');
    groups.find((g) => g.id === half)!.clubs.push(californiaClub(m, club, info));
  }
  return groups.filter((g) => g.clubs.length > 0);
}

function californiaClub(m: FestivalModel, club: FestivalClub, info: ReturnType<SiteClubLookup>): CaliforniaClubModel {
  return {
    slug: club.slug,
    name: club.name,
    href: clubHref(club.slug),
    region: info?.regionLabel ?? club.region,
    site: info ? { name: info.name, href: info.href } : null,
    teams: club.teamIds.map((id) => teamCard(m, id)),
  };
}

export function buildHubView(m: FestivalModel = festivalModel(), site: SiteClubLookup = siteClubInfo): HubViewModel {
  const { tournament, games, teams, fetchedAt } = m.file;
  const { text, complete } = statusLine(m);
  const { latest, next } = latestAndNext(m.file);
  const slotOf = (startUtc: string | null): SlotModel<GameRowModel> | null => {
    if (!startUtc) return null;
    const days: DayModel<GameRowModel>[] = byDayAndSlot(
      games.filter((g) => g.startUtc === startUtc),
      (g) => gameRow(m, g),
    );
    return days[0]?.slots[0] ?? null;
  };
  return {
    name: tournament.name,
    place: `${tournament.venue.city}, ${AP_STATE[tournament.venue.state] ?? tournament.venue.state}`,
    venue: tournament.venue.name,
    dates: eventDates(tournament.startDate, tournament.endDate),
    status: text,
    complete,
    stamp: stampWords(fetchedAt),
    fetchedAt,
    resultsUrl: tournament.resultsUrl,
    infoUrl: tournament.infoUrl,
    cards: teams.map((t) => teamCard(m, t.id)),
    california: californiaGroups(m, site),
    latest: slotOf(latest),
    next: slotOf(next),
    divisions: divisionRows(m),
    clubs: m.clubs.map((c) => ({ slug: c.slug, href: clubHref(c.slug), name: c.name, teams: c.teamIds.length })),
    teams: teams.length,
    games: games.length,
    finals: finalsOf(games),
  };
}

/** The chrome every festival page shares: the event's name, where and when, and how fresh its scores are. */
export interface FestivalChromeModel {
  name: string;
  place: string;
  dates: string;
  stamp: string;
  resultsUrl: string;
  complete: boolean;
  tabs: { id: string; href: string; label: string }[];
}

export function buildChrome(m: FestivalModel = festivalModel()): FestivalChromeModel {
  const { tournament, fetchedAt } = m.file;
  return {
    name: tournament.name,
    place: `${tournament.venue.city}, ${AP_STATE[tournament.venue.state] ?? tournament.venue.state}`,
    dates: eventDates(tournament.startDate, tournament.endDate),
    stamp: stampWords(fetchedAt),
    resultsUrl: tournament.resultsUrl,
    complete: statusLine(m).complete,
    tabs: [
      { id: 'overview', href: '/festival', label: 'Overview' },
      { id: 'schedule', href: '/festival/schedule', label: 'Schedule' },
      ...m.file.divisions.map((d) => ({ id: d.slug, href: divisionHref(d.slug), label: d.short })),
      { id: 'clubs', href: '/festival/clubs', label: 'Clubs' },
    ],
  };
}
