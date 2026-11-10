/**
 * The live resource table (SPEC §7.3): for every ResourceKey kind, its upstream URL, which request
 * budget it counts against, its recorded file extension, whether its body is a hash, and how
 * LiveTransport fetches it. lib/pipeline/transport.ts reads every per-kind fact from here, so a new
 * kind is one entry below (plus its key and corpus path in lib/pipeline/contract.ts), and a kind
 * without an entry is a compile error.
 *
 * The corpus path stays in contract.ts (resourcePath), which must not load lib/sources at runtime.
 */

import { CCS, sdsBracketSheetCsvUrl } from '../league-config/sections';
import { getDivision, getLeague } from '../leagues';
import { officialChangesCellText, sha256Hex } from '../official/validate';
import { BOOTSTRAP_URL } from '../season';
import { CCS_ICAL_URL } from '../sources/ccs';
import { CIFSS_SEASON_FROM, cifssListingUrl } from '../sources/cifss';
import type { HttpClient } from '../sources/http';
import { maxprepsLeagueMetaUrl, maxprepsScheduleUrl, maxprepsStandingsUrl, type MaxPrepsClient } from '../sources/maxpreps';
import { sbliveScoresUrl } from '../sources/sblive';
import { SCVAL_STANDINGS_INDEX, scvalScheduleUrl } from '../sources/scval-pdf';
import { VNN_SITE_IDS, vnnIcsUrl } from '../sources/vnn-ics';
import { getTeamBySlug } from '../teams';
import type { DivisionId, TeamSlug } from '../types';
import { TransportError, type RawResponse, type ResourceKey } from './contract';
import type { RequestHost } from './transport';

export type ResourceKind = ResourceKey['kind'];
export type KeyOf<K extends ResourceKind> = Extract<ResourceKey, { kind: K }>;

export type TextClient = Pick<HttpClient, 'text' | 'bytes'>;

/** What a live fetch may use: LiveTransport's clients. */
export interface LiveClients {
  maxpreps: Pick<MaxPrepsClient, 'raw'>;
  http: TextClient;
  sblive: TextClient;
  /** pdftotext over the SCVAL grid PDF bytes. */
  toText(bytes: Uint8Array): string;
}

export interface ResourceSpec<Key extends ResourceKey> {
  /** Which budget the resource counts against (the summary line's `requests maxpreps:<n> sblive:<n> official:<n>`). */
  host: RequestHost;
  /** File extension of a recorded resource. */
  ext: '.json' | '.html' | '.ics' | '.txt' | '.csv';
  /** The body is a hash by contract (§7.2): served and recorded as one bare hex line. */
  hashBody?: true;
  /** The upstream URL. Pure; throws only for a key the configuration cannot address. */
  url(key: Key): string;
  /** One live read of `url`. HTTP and network failures throw; LiveTransport turns them into TransportError. */
  fetch(c: LiveClients, url: string, key: Key): Promise<RawResponse>;
}

function teamOrThrow(slug: TeamSlug) {
  const team = getTeamBySlug(slug);
  if (!team) throw new Error(`lib/pipeline/resources.ts: unknown team slug ${slug}`);
  return team;
}

/**
 * A division's MaxPreps league id, or a throw for a division MaxPreps publishes no table for (the
 * San Diego Section's Valley division: lib/league-config/north-county.ts sets maxprepsLeagueId null, DESIGN-socal §2.1.7).
 * Steps 03 and 04 never build a key for such a division (league-meta.ts and reported.ts skip it with
 * no request), so reaching this throw is a pipeline bug, and it surfaces before any request instead
 * of as a GET of `/leagues/null/v1`.
 */
function maxprepsLeagueIdOrThrow(division: DivisionId): string {
  const id = getDivision(division).maxprepsLeagueId;
  if (id === null) throw new Error(`lib/pipeline/resources.ts: MaxPreps publishes no table for ${division}`);
  return id;
}

/** MaxPrepsClient.raw: its gate, retries and User-Agent. */
const maxprepsRaw = (c: LiveClients, url: string) => c.maxpreps.raw(url);

async function httpText(client: TextClient, url: string, accept?: string): Promise<RawResponse> {
  // No `accept` argument at all when none is given, so the client's own default applies.
  const res = accept === undefined ? await client.text(url) : await client.text(url, accept);
  return { url: res.url, httpStatus: res.httpStatus, body: res.body };
}

export const RESOURCES: { [K in ResourceKind]: ResourceSpec<KeyOf<K>> } = {
  'maxpreps-bootstrap': {
    host: 'maxpreps',
    ext: '.html', // an HTML page, whatever host it lives on
    url: () => BOOTSTRAP_URL,
    fetch: maxprepsRaw,
  },
  'maxpreps-league-meta': {
    host: 'maxpreps',
    ext: '.json',
    url: (key) => maxprepsLeagueMetaUrl(maxprepsLeagueIdOrThrow(key.division)),
    fetch: maxprepsRaw,
  },
  'maxpreps-standings': {
    host: 'maxpreps',
    ext: '.json',
    url: (key) => maxprepsStandingsUrl(maxprepsLeagueIdOrThrow(key.division)),
    fetch: maxprepsRaw,
  },
  'maxpreps-schedule': {
    host: 'maxpreps',
    ext: '.json',
    url: (key) => maxprepsScheduleUrl(teamOrThrow(key.team).id),
    fetch: maxprepsRaw,
  },
  'scval-pdf-text': {
    host: 'official',
    ext: '.txt',
    url: (key) => scvalScheduleUrl(key.division),
    fetch: async (c, url) => {
      const res = await c.http.bytes(url);
      return { url: res.url, httpStatus: res.httpStatus, body: c.toText(res.body) };
    },
  },
  'scval-standings-index': {
    host: 'official',
    ext: '.html',
    url: () => SCVAL_STANDINGS_INDEX,
    fetch: (c, url) => httpText(c.http, url),
  },
  'official-revision': {
    host: 'official',
    ext: '.txt',
    hashBody: true,
    url: (key) => {
      // Bundled divisions only: a live PDF is read whole and a 'none' division (EAL) has no document.
      const official = getDivision(key.division).official;
      const url = official.mode === 'bundled' ? official.revisionCheckUrl : null;
      if (!url) throw new Error(`lib/pipeline/resources.ts: ${key.division} has no revision-check URL`);
      return url;
    },
    fetch: async (c, url) => {
      const res = await c.http.bytes(url, '*/*');
      return { url: res.url, httpStatus: res.httpStatus, body: sha256Hex(res.body) };
    },
  },
  'official-changes': {
    host: 'official',
    ext: '.txt',
    hashBody: true,
    url: (key) => {
      const changes = getLeague(key.league).officialChanges;
      if (!changes) throw new Error(`lib/pipeline/resources.ts: ${key.league} has no officialChanges page`);
      return changes.url;
    },
    fetch: async (c, url, key) => {
      const res = await c.http.text(url);
      const marker = getLeague(key.league).officialChanges?.cellMarker ?? '';
      const cell = officialChangesCellText(res.body, marker);
      if (cell === null) {
        throw new TransportError(`no <td> containing "${marker}" on the page`, url, res.httpStatus);
      }
      return { url: res.url, httpStatus: res.httpStatus, body: sha256Hex(cell) };
    },
  },
  'sblive-scores': {
    host: 'sblive',
    ext: '.html',
    url: (key) => sbliveScoresUrl(key.date),
    fetch: (c, url) => httpText(c.sblive, url),
  },
  'sblive-team-games': {
    host: 'sblive',
    ext: '.html',
    url: (key) => {
      // The registry's si.com page (built from the team's si.com slug; never guessed).
      const url = teamOrThrow(key.team).external.sbliveGamesUrl;
      if (!url) throw new Error(`lib/pipeline/resources.ts: no si.com team page is recorded for ${key.team}`);
      return url;
    },
    fetch: (c, url) => httpText(c.sblive, url),
  },
  'vnn-ics': {
    host: 'other',
    ext: '.ics',
    url: (key) => {
      const site = VNN_SITE_IDS.find((s) => s.slug === key.team);
      const siteId = site?.siteId ?? teamOrThrow(key.team).external.vnnSiteId;
      if (!siteId) throw new Error(`lib/pipeline/resources.ts: no VNN calendar is recorded for ${key.team}`);
      return vnnIcsUrl(siteId);
    },
    fetch: (c, url) => httpText(c.http, url, 'text/calendar,text/plain,*/*'),
  },
  'ccs-ical': {
    host: 'other',
    ext: '.ics',
    url: () => CCS_ICAL_URL,
    fetch: (c, url) => httpText(c.http, url, 'text/calendar,text/plain,*/*'),
  },
  'ccs-bracket': {
    host: 'other',
    ext: '.html',
    url: () => {
      if (CCS.bracketUrl === null) throw new Error('no MaxPreps CCS tournament page is configured for this season');
      return CCS.bracketUrl;
    },
    fetch: (c, url) => httpText(c.http, url),
  },
  'cifss-scores': {
    host: 'other',
    ext: '.html',
    url: (key) => cifssListingUrl(key.section, { from: CIFSS_SEASON_FROM, to: key.through, page: key.page }),
    fetch: (c, url) => httpText(c.http, url),
  },
  'sds-bracket-sheet': {
    host: 'other',
    ext: '.csv',
    url: (key) => sdsBracketSheetCsvUrl(key.division),
    fetch: (c, url) => httpText(c.http, url, 'text/csv,text/plain,*/*'),
  },
};

/** The table entry for `key`, typed to that key's kind. */
export function specOf<K extends ResourceKind>(key: KeyOf<K>): ResourceSpec<KeyOf<K>> {
  // TypeScript cannot correlate RESOURCES[key.kind] with key's own kind (microsoft/TypeScript#47109),
  // so this one cast states it; the mapped type above already checks every entry against its key.
  return RESOURCES[key.kind as K] as unknown as ResourceSpec<KeyOf<K>>;
}
