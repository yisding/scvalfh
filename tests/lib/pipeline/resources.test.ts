/**
 * The resource table (SPEC §7.2/§7.3): for one key per ResourceKey kind, the manifest path, the
 * recorded extension, the budget host, whether the body is a hash by contract and the upstream URL,
 * as literals. `resourcePath` strings are corpus manifest keys (tests/fixtures/corpus/**), so a
 * change here is a corpus migration, not a refactor.
 */

import { describe, expect, it } from 'vitest';

import { resourcePath } from '@/lib/pipeline/contract';
import type { ResourceKey } from '@/lib/pipeline/resources';
import { isHashResource, recordedExtension, requestHostOf, resourceUrl } from '@/lib/pipeline/transport';

interface Expected {
  key: ResourceKey;
  path: string;
  ext: '.html' | '.json' | '.ics' | '.txt';
  host: 'maxpreps' | 'sblive' | 'official' | 'other';
  hash: boolean;
  url: string;
}

const CASES: Expected[] = [
  {
    key: { kind: 'maxpreps-bootstrap' },
    path: 'maxpreps/bootstrap', ext: '.html', host: 'maxpreps', hash: false,
    url: 'https://www.maxpreps.com/ca/field-hockey/',
  },
  {
    key: { kind: 'maxpreps-league-meta', division: 'pcal' },
    path: 'maxpreps/league-meta/pcal', ext: '.json', host: 'maxpreps', hash: false,
    url: 'https://production.api.maxpreps.com/leagues/50ac53cd-e46f-4df9-824b-5a954c583b95/v1',
  },
  {
    key: { kind: 'maxpreps-standings', division: 'pcal' },
    path: 'maxpreps/standings/pcal', ext: '.json', host: 'maxpreps', hash: false,
    url: 'https://production.api.maxpreps.com/leagues/50ac53cd-e46f-4df9-824b-5a954c583b95/standings/v1?sportseasonid=e302eb3e-1a32-4f2d-934b-6f9d454f721e',
  },
  {
    key: { kind: 'maxpreps-schedule', team: 'leigh' },
    path: 'maxpreps/schedule/leigh', ext: '.json', host: 'maxpreps', hash: false,
    url: 'https://production.api.maxpreps.com/gatewayweb/react/schedule-calculated/v1?teamId=bd6662e8-a2ee-45ca-b0e8-dd03dec005c9&sportSeasonId=e302eb3e-1a32-4f2d-934b-6f9d454f721e',
  },
  {
    key: { kind: 'scval-standings-index' },
    path: 'scval/standings-index', ext: '.html', host: 'official', hash: false,
    url: 'https://www.scval.com/standings/',
  },
  {
    key: { kind: 'official-revision', division: 'pcal' },
    path: 'official/revision/pcal', ext: '.txt', host: 'official', hash: true,
    url: 'https://pcalathletics.org/wp-content/pdf/PCAL-Field-Hockey.2026.FINAL_.pdf',
  },
  {
    key: { kind: 'official-changes', league: 'mcal' },
    path: 'official/changes/mcal', ext: '.txt', host: 'official', hash: true,
    url: 'https://www.mcalsports.org/Schedir.htm',
  },
  {
    key: { kind: 'sblive-scores', date: '2026-09-30' },
    path: 'sblive/scores/2026-09-30', ext: '.html', host: 'sblive', hash: false,
    url: 'https://www.si.com/high-school/stats/california/field-hockey/scores?date=2026-09-30',
  },
  {
    key: { kind: 'sblive-team-games', team: 'carmel' },
    path: 'sblive/team-games/carmel', ext: '.html', host: 'sblive', hash: false,
    url: 'https://www.si.com/high-school/stats/california/field-hockey/teams/458529-carmel-padres/games',
  },
  {
    key: { kind: 'vnn-ics', team: 'palo-alto' },
    path: 'vnn/palo-alto', ext: '.ics', host: 'other', hash: false,
    url: 'https://mmboltapi.azurewebsites.net/api/v2/events/calendar/2635290/0/calendar.ics',
  },
  {
    key: { kind: 'ccs-ical' },
    path: 'ccs/ical', ext: '.ics', host: 'other', hash: false,
    url: 'https://cifccs.org/calendar/Field_Hockey?print=ical',
  },
  {
    key: { kind: 'ccs-bracket' },
    path: 'ccs/bracket', ext: '.html', host: 'other', hash: false,
    url: 'https://www.maxpreps.com/tournament/3jB4uWWtwk20vrdggAkzMA/field-hockey-26/2026-central-coast-section-field-hockey-championship.htm',
  },
  {
    key: { kind: 'cifss-scores', section: 'ss', page: 2, through: '2026-10-04' },
    path: 'cifss/ss/2', ext: '.html', host: 'other', hash: false,
    url: 'https://www.cifsshome.org/widget/schedule-score?section_id=1&year=2026&sport_id=30&date_from=08%2F01%2F2026&date_to=10%2F04%2F2026&page=2',
  },
];

describe('the resource table', () => {
  it.each(CASES)('$key.kind', ({ key, path, ext, host, hash, url }) => {
    expect(resourcePath(key)).toBe(path);
    expect(recordedExtension(key)).toBe(ext);
    expect(requestHostOf(key)).toBe(host);
    expect(isHashResource(key)).toBe(hash);
    expect(resourceUrl(key)).toBe(url);
  });

  it('covers every kind once, and the live pdf-text kind keeps its path and budget host', () => {
    // scval-pdf-text has no URL case above: the live-pdf divisions' URLs are config (grid.ts).
    const key: ResourceKey = { kind: 'scval-pdf-text', division: 'de-anza' };
    expect(resourcePath(key)).toBe('scval/pdf-text/de-anza');
    expect(recordedExtension(key)).toBe('.txt');
    expect(requestHostOf(key)).toBe('official');
    expect(isHashResource(key)).toBe(false);
    expect(resourceUrl(key)).toMatch(/^https:\/\//);
    expect(new Set([...CASES.map((c) => c.key.kind), key.kind]).size).toBe(14);
  });

  it('refuses keys the configuration cannot address', () => {
    expect(() => resourceUrl({ kind: 'maxpreps-league-meta', division: 'valley' })).toThrow(
      'MaxPreps publishes no table for valley',
    );
    expect(() => resourceUrl({ kind: 'official-revision', division: 'eal' })).toThrow(
      'eal has no revision-check URL',
    );
    expect(() => resourceUrl({ kind: 'official-changes', league: 'scval' })).toThrow(
      'scval has no officialChanges page',
    );
  });
});
