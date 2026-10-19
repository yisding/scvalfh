/**
 * The resource table (SPEC §7.2, §7.3): everything the pipeline knows about ONE kind of upstream
 * resource, in one row. `contract.ts` declares the keys; this table says, per kind, the manifest
 * path (`resourcePath`, also the corpus file stem), the file extension a recorded response gets,
 * the budget host it counts against, whether its body is a hash by contract, its upstream URL
 * (the frozen live resource map; transport.ts documents it) and how LiveTransport reads it.
 *
 * Before this table those six facts were five parallel `switch (key.kind)` statements in
 * contract.ts and transport.ts. `satisfies { [K in ResourceKey['kind']]: … }` makes a new kind a
 * compile error until every fact exists, instead of a silent fall-through in the one switch someone
 * forgot. The five functions that read the table (`resourcePath`, `requestHostOf`, `resourceUrl`,
 * `recordedExtension`, `isHashResource`) keep their names and live where their callers import them.
 *
 * Pure: builds paths and URLs from configuration, never fetches.
 */

import { CCS, getDivision, getLeague } from '@/lib/config/leagues';
import { BOOTSTRAP_URL } from '@/lib/config/season';
import type { DivisionId, LeagueId, TeamSlug } from '@/lib/model/ids';
import { getTeamBySlug } from '@/lib/registry/teams';
import { CCS_ICAL_URL } from '@/lib/sources/ccs';
import { CIFSS_SEASON_FROM, cifssListingUrl, type CifssSectionKey } from '@/lib/sources/cifss';
import { leagueMetaUrl, scheduleUrl, standingsUrl } from '@/lib/sources/maxpreps/urls';
import { sbliveScoresUrl } from '@/lib/sources/sblive/urls';
import { scvalScheduleUrl } from '@/lib/sources/scval/grid';
import { SCVAL_STANDINGS_INDEX } from '@/lib/sources/scval/standings-index';
import { VNN_SITE_IDS, vnnIcsUrl } from '@/lib/sources/vnn-ics';

/** One upstream resource. `resourcePath(key)` is its manifest key and its corpus file stem. */
export type ResourceKey =
  | { kind: 'maxpreps-bootstrap' }
  | { kind: 'maxpreps-league-meta'; division: DivisionId }
  | { kind: 'maxpreps-standings'; division: DivisionId }
  | { kind: 'maxpreps-schedule'; team: TeamSlug }
  | { kind: 'scval-pdf-text'; division: DivisionId }      // pdftotext output of the SCVAL grid PDF
  | { kind: 'scval-standings-index' }
  | { kind: 'official-revision'; division: DivisionId }   // body = lowercase hex sha256 of the upstream document bytes
  | { kind: 'official-changes'; league: LeagueId }        // body = lowercase hex sha256 of the officialChanges cell text (§2.1)
  | { kind: 'sblive-scores'; date: string }               // YYYY-MM-DD
  | { kind: 'sblive-team-games'; team: TeamSlug }
  | { kind: 'vnn-ics'; team: TeamSlug }
  | { kind: 'ccs-ical' }
  | { kind: 'ccs-bracket' }
  /** One page of a Section's cifsshome.org listing, season start through `through` (YYYY-MM-DD). */
  | { kind: 'cifss-scores'; section: CifssSectionKey; page: number; through: string };

/** Which budget a resource counts against (the summary line's `requests maxpreps:<n> sblive:<n> official:<n>`). */
export type RequestHost = 'maxpreps' | 'sblive' | 'official' | 'other';

/**
 * How LiveTransport turns the HTTP response into the RawResponse body:
 *  - 'maxpreps'            MaxPrepsClient.raw (its gate, retries, UA);
 *  - 'pdf-text'            HttpClient.bytes, then pdftotext;
 *  - 'sha-of-bytes'        HttpClient.bytes (any Accept), then the lowercase hex sha256 of the document;
 *  - 'sha-of-changes-cell' HttpClient.text, then the sha256 of the league's officialChanges cell text;
 *  - 'sblive'              the si.com HttpClient (SBLIVE_HTTP_OPTIONS), text;
 *  - 'ics'                 HttpClient.text with a calendar Accept header;
 *  - 'html'                HttpClient.text.
 */
export type ResourceRead = 'maxpreps' | 'pdf-text' | 'sha-of-bytes' | 'sha-of-changes-cell' | 'sblive' | 'ics' | 'html';

/**
 * One kind's row. Method syntax on purpose: the parameter is checked bivariantly, so a row typed to
 * its own kind is assignable to ResourceSpec<ResourceKey> and `specOf` needs no cast.
 */
export interface ResourceSpec<K extends ResourceKey> {
  /** The manifest key and corpus file stem. */
  path(key: K): string;
  host: RequestHost;
  /** Extension of a recorded response: '.json' | '.html' | '.ics' | '.txt'. */
  ext: '.json' | '.html' | '.ics' | '.txt';
  /** The body is a hash by contract (§7.2): served and recorded as one bare hex line. */
  hash: boolean;
  /**
   * The upstream URL. Throws only for a key the configuration cannot address (an unknown slug, a
   * division with no revision-check URL).
   */
  url(key: K): string;
  read: ResourceRead;
}

type KeyOf<K extends ResourceKey['kind']> = Extract<ResourceKey, { kind: K }>;

function teamOrThrow(slug: TeamSlug) {
  const team = getTeamBySlug(slug);
  if (!team) throw new Error(`lib/pipeline/resources.ts: unknown team slug ${slug}`);
  return team;
}

/**
 * A division's MaxPreps league id, or a throw for a division MaxPreps publishes no table for (the
 * San Diego Section's Valley division: lib/config/leagues.ts sets maxprepsLeagueId null, DESIGN-socal §2.1.7).
 * Steps 03 and 04 never build a key for such a division (league-meta.ts and reported.ts skip it with
 * no request), so reaching this throw is a pipeline bug, and it surfaces before any request instead
 * of as a GET of `/leagues/null/v1`.
 */
function maxprepsLeagueIdOrThrow(division: DivisionId): string {
  const id = getDivision(division).maxprepsLeagueId;
  if (id === null) throw new Error(`lib/pipeline/resources.ts: MaxPreps publishes no table for ${division}`);
  return id;
}

/**
 * 'maxpreps/bootstrap', 'maxpreps/league-meta/<division>', 'maxpreps/standings/<division>',
 * 'maxpreps/schedule/<slug>', 'scval/pdf-text/<division>', 'scval/standings-index',
 * 'official/revision/<division>', 'official/changes/<league>', 'sblive/scores/<date>', 'sblive/team-games/<slug>',
 * 'vnn/<slug>', 'ccs/ical', 'ccs/bracket', 'cifss/<section>/<page>'
 */
export const RESOURCES = {
  'maxpreps-bootstrap': {
    path: () => 'maxpreps/bootstrap',
    host: 'maxpreps',
    ext: '.html', // an HTML page, whatever host it lives on
    hash: false,
    url: () => BOOTSTRAP_URL,
    read: 'maxpreps',
  },
  'maxpreps-league-meta': {
    path: (key) => `maxpreps/league-meta/${key.division}`,
    host: 'maxpreps',
    ext: '.json',
    hash: false,
    url: (key) => leagueMetaUrl(maxprepsLeagueIdOrThrow(key.division)),
    read: 'maxpreps',
  },
  'maxpreps-standings': {
    path: (key) => `maxpreps/standings/${key.division}`,
    host: 'maxpreps',
    ext: '.json',
    hash: false,
    url: (key) => standingsUrl(maxprepsLeagueIdOrThrow(key.division)),
    read: 'maxpreps',
  },
  'maxpreps-schedule': {
    path: (key) => `maxpreps/schedule/${key.team}`,
    host: 'maxpreps',
    ext: '.json',
    hash: false,
    url: (key) => scheduleUrl(teamOrThrow(key.team).id),
    read: 'maxpreps',
  },
  'scval-pdf-text': {
    path: (key) => `scval/pdf-text/${key.division}`,
    host: 'official',
    ext: '.txt',
    hash: false,
    url: (key) => scvalScheduleUrl(key.division),
    read: 'pdf-text',
  },
  'scval-standings-index': {
    path: () => 'scval/standings-index',
    host: 'official',
    ext: '.html',
    hash: false,
    url: () => SCVAL_STANDINGS_INDEX,
    read: 'html',
  },
  'official-revision': {
    path: (key) => `official/revision/${key.division}`,
    host: 'official',
    ext: '.txt',
    hash: true,
    url: (key) => {
      // Bundled divisions only: a live PDF is read whole and a 'none' division (EAL) has no document.
      const official = getDivision(key.division).official;
      const url = official.mode === 'bundled' ? official.revisionCheckUrl : null;
      if (!url) throw new Error(`lib/pipeline/resources.ts: ${key.division} has no revision-check URL`);
      return url;
    },
    read: 'sha-of-bytes',
  },
  'official-changes': {
    path: (key) => `official/changes/${key.league}`,
    host: 'official',
    ext: '.txt',
    hash: true,
    url: (key) => {
      const changes = getLeague(key.league).officialChanges;
      if (!changes) throw new Error(`lib/pipeline/resources.ts: ${key.league} has no officialChanges page`);
      return changes.url;
    },
    read: 'sha-of-changes-cell',
  },
  'sblive-scores': {
    path: (key) => `sblive/scores/${key.date}`,
    host: 'sblive',
    ext: '.html',
    hash: false,
    url: (key) => sbliveScoresUrl(key.date),
    read: 'sblive',
  },
  'sblive-team-games': {
    path: (key) => `sblive/team-games/${key.team}`,
    host: 'sblive',
    ext: '.html',
    hash: false,
    url: (key) => {
      // The registry's si.com page (built from the team's si.com slug; never guessed).
      const url = teamOrThrow(key.team).external.sbliveGamesUrl;
      if (!url) throw new Error(`lib/pipeline/resources.ts: no si.com team page is recorded for ${key.team}`);
      return url;
    },
    read: 'sblive',
  },
  'vnn-ics': {
    path: (key) => `vnn/${key.team}`,
    host: 'other',
    ext: '.ics',
    hash: false,
    url: (key) => {
      const site = VNN_SITE_IDS.find((s) => s.slug === key.team);
      const siteId = site?.siteId ?? teamOrThrow(key.team).external.vnnSiteId;
      if (!siteId) throw new Error(`lib/pipeline/resources.ts: no VNN calendar is recorded for ${key.team}`);
      return vnnIcsUrl(siteId);
    },
    read: 'ics',
  },
  'ccs-ical': {
    path: () => 'ccs/ical',
    host: 'other',
    ext: '.ics',
    hash: false,
    url: () => CCS_ICAL_URL,
    read: 'ics',
  },
  'ccs-bracket': {
    path: () => 'ccs/bracket',
    host: 'other',
    ext: '.html',
    hash: false,
    url: () => CCS.bracketUrl,
    read: 'html',
  },
  'cifss-scores': {
    path: (key) => `cifss/${key.section}/${key.page}`,
    host: 'other',
    ext: '.html',
    hash: false,
    url: (key) => cifssListingUrl(key.section, { from: CIFSS_SEASON_FROM, to: key.through, page: key.page }),
    read: 'html',
  },
} satisfies { [K in ResourceKey['kind']]: ResourceSpec<KeyOf<K>> };

/** The row of a key's kind. */
export function specOf(key: ResourceKey): ResourceSpec<ResourceKey> {
  return RESOURCES[key.kind];
}
