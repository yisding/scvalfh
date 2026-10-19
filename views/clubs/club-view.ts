/**
 * The club pages (/clubs, /clubs/[slug]) and the team roster's club line (SPEC §1.1j2, DESIGN §17),
 * derived from lib/datasets/clubs.ts. Pure, so tests/views/clubs/club-view.test.ts can assert it over the real files;
 * every word a club page or a club line prints about a club tie is chosen here, in views/clubs/: this
 * module builds the two pages, and the modules beside it hold the wording tables (words.ts), the
 * roster's club line (club-line.ts) and each page's shapes and rows (clubs-index.ts, club-page.ts).
 *
 * What the pages promise, and these modules enforce:
 *   - only rows on the tracked varsity rosters are named: a row is an affiliation, and every
 *     affiliation joined a non-JV row of data/rosters.json at load (lib/datasets/clubs.ts), under that
 *     row's own spelling. A club's own roster names many more players; it is linked, never copied;
 *   - `quote`, `basis`, `confidence`, `statedSchool` and `statedClassYear` never reach a view type:
 *     the quote and the basis are for maintainers and can name people who are not players here, and
 *     a per-row confidence mark is not built (DESIGN §17.6);
 *   - `unknown` is never worded as current: it reads "Listed by <source>, <date>", and on the
 *     roster its group is "Listed club";
 *   - link labels come from the source kind and the host, never from a URL path — apart from the
 *     page-type tests (`/athlete/`, `/roster`, `/organization/`), so a label stays true when a page
 *     moves, and a name in a slug (a player's profile, a coach's page) is never printed;
 *   - every player row links the pages it rests on, each URL once.
 */

import {
  type Club, SEARCHED_REGIONS, clubDisplayName, getAffiliatedPlayer, getClubAffiliations, getClubs, getClubsFile,
} from '@/lib/datasets/clubs';
import { getRosters } from '@/lib/datasets/rosters';
import { dateWithYear } from '@/lib/format/dates';
import { plural } from '@/lib/format/words';
import { CLUB_REGIONS, CLUB_REGION_SITE_REGION } from '@/lib/schema/clubs';
import { clubHref } from '@/lib/shared/routes';
import { hostOf, numbered, schoolName } from '@/views/shared/source-links';

import { playerRow, programSourceLabel, rosterPageLabel, sharedProgramSource } from './club-page';
import type { ClubPageView, ClubPlayerGroup } from './club-page';
import { clubParam } from './club-route';
import { countLine, currentSeasons, lede, notSearchedSentence } from './clubs-index';
import type { ClubIndexRow, ClubRegionGroup, ClubsIndexView } from './clubs-index';
import { REGION_WORDS, basedWords } from './words';

// ---------------------------------------------------------------- /clubs

/** `/clubs`: every club, grouped by region, each with its tied players' counts and schools. */
export function buildClubsIndexView(): ClubsIndexView {
  const file = getClubsFile();
  const clubs = getClubs();
  const trackedTeams = getRosters().teams.length;

  const rows: Array<{ club: Club; row: ClubIndexRow }> = clubs.map((club) => {
    const ties = getClubAffiliations(club.slug);
    const current = ties.filter((a) => a.status === 'current').length;
    return {
      club,
      row: {
        slug: club.slug,
        href: clubHref(club.slug),
        name: clubDisplayName(club),
        subline: [club.shortName !== null ? club.name : null, club.city].filter(Boolean).join(' · ') || null,
        current,
        other: ties.length - current,
        countLine: countLine(ties),
        schools: [...new Set(ties.map((a) => schoolName(a.teamSlug)))].sort((a, b) => a.localeCompare(b)),
      },
    };
  });

  const regions: ClubRegionGroup[] = CLUB_REGIONS.flatMap((id) => {
    const inRegion = rows.filter((r) => r.club.region === id).map((r) => r.row);
    return inRegion.length === 0
      ? []
      : [
          {
            id,
            siteRegion: CLUB_REGION_SITE_REGION[id],
            heading: REGION_WORDS[id].label,
            meta: plural(inRegion.length, 'club'),
            clubs: inRegion,
          },
        ];
  });
  const empty = SEARCHED_REGIONS.filter((r) => !clubs.some((c) => c.region === r));
  const notSearched = CLUB_REGIONS.filter(
    (r) => r !== 'elsewhere' && !SEARCHED_REGIONS.includes(r) && clubs.some((c) => c.region === r),
  );

  const playerCount = new Set(file.affiliations.map((a) => `${a.teamSlug} ${a.athleteId}`)).size;
  const schoolCount = new Set(file.affiliations.map((a) => a.teamSlug)).size;
  const withPlayers = rows
    .map((r) => r.row)
    .filter((r) => r.current + r.other > 0)
    .sort((a, b) => b.current + b.other - (a.current + a.other) || a.name.localeCompare(b.name));

  return {
    lede: lede(trackedTeams, playerCount, schoolCount, clubs.length, withPlayers),
    regions,
    regionsWithoutClubs: empty.map((r) => REGION_WORDS[r].label),
    regionsWithoutClubsSentence: empty.length > 0 ? `This list has no club based ${basedWords(empty)}.` : null,
    regionsNotSearched: notSearched.map((r) => REGION_WORDS[r].label),
    regionsNotSearchedSentence: notSearched.length > 0 ? notSearchedSentence(notSearched) : null,
    trackedTeams,
    playerCount,
    schoolCount,
    clubCount: clubs.length,
    clubsWithPlayers: withPlayers.length,
    capturedOn: dateWithYear(file.capturedAt),
    currentSeasons: currentSeasons(file.season),
  };
}

// ---------------------------------------------------------------- /clubs/[slug]

/** One club's page. null for a slug data/clubs.json does not hold. */
export function buildClubPageView(slug: string): ClubPageView | null {
  const club = clubParam(slug);
  if (!club) return null;
  const name = clubDisplayName(club);

  // School, then the roster's own name order (lib/datasets/rosters.ts sortedPlayers' byName).
  const ties = [...getClubAffiliations(slug)]
    .map((a) => ({ a, p: getAffiliatedPlayer(a), school: schoolName(a.teamSlug) }))
    .sort(
      (x, y) =>
        x.school.localeCompare(y.school) ||
        (x.p.lastName ?? x.p.fullName).localeCompare(y.p.lastName ?? y.p.fullName) ||
        x.p.fullName.localeCompare(y.p.fullName),
    )
    .map(({ a }) => a);
  const current = ties.filter((a) => a.status === 'current');
  const other = ties.filter((a) => a.status !== 'current');
  const groups: ClubPlayerGroup[] = [];
  if (current.length > 0) groups.push({ id: 'current', heading: 'Current', rows: current.map((a) => playerRow(a, club)) });
  if (other.length > 0) {
    groups.push({
      id: 'other',
      heading: other.some((a) => a.status === 'unknown') ? 'Earlier, or not known to be current' : 'Earlier',
      rows: other.map((a) => playerRow(a, club)),
    });
  }

  const region = REGION_WORDS[club.region].label;
  const shared = sharedProgramSource(club);
  return {
    slug: club.slug,
    name,
    fullName: club.shortName !== null ? club.name : null,
    regionLabel: club.region === 'elsewhere' || region === club.city ? null : region,
    facts: [club.city, club.founded !== null ? `Founded ${club.founded}` : null].filter((f): f is string => f !== null),
    website: club.website,
    description: club.description,
    groups,
    playerCount: ties.length,
    programs: club.programs.map((p, i) => ({
      key: `${i}-${p.name}`,
      name: p.name,
      detail: p.detail,
      source: p.source === shared?.url ? null : { label: programSourceLabel(p.source, club), url: p.source },
    })),
    programsSource: shared,
    rosterPages: numbered(club.rosterPages.map((url) => ({ label: rosterPageLabel(url, club), url, host: hostOf(url) }))),
    sources: club.sources
      .filter((s) => !club.rosterPages.includes(s.url))
      .map((s) => ({ label: s.what, url: s.url, host: hostOf(s.url) })),
    trackedTeams: getRosters().teams.length,
    checkedOn: dateWithYear(club.checkedOn),
  };
}
